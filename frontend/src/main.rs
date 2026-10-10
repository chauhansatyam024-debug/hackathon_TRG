use axum::{
    extract::{Path, Query, State, Multipart},
    http::{Method, StatusCode},
    response::IntoResponse,
    routing::{delete, get, post, put},
    Json, Router, middleware,
};
use reqwest::Client as HttpClient;
use std::{net::SocketAddr, time::Duration};
use tower_http::{
    cors::{Any, CorsLayer},
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod auth;

#[derive(Clone)]
pub struct AppState {
    pub http_client: HttpClient,
    pub ai_service_url: String,
    pub backend_url: String,
}

// GET /api/tasks
async fn list_tasks(
    State(state): State<AppState>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let response = state
        .http_client
        .get(format!("{}/api/tasks", state.backend_url))
        .query(&params)
        .send()
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, e.to_string()))?;

    let status = response.status();
    let body = response.json::<serde_json::Value>().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok((status, Json(body)))
}

// GET /api/tasks/{id}
async fn get_task(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let response = state
        .http_client
        .get(format!("{}/api/tasks/{}", state.backend_url, id))
        .send()
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, e.to_string()))?;

    let status = response.status();
    let body = response.json::<serde_json::Value>().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok((status, Json(body)))
}

// PUT /api/tasks/{id}
async fn update_task(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<serde_json::Value>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let response = state
        .http_client
        .put(format!("{}/api/tasks/{}", state.backend_url, id))
        .json(&body)
        .send()
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, e.to_string()))?;

    let status = response.status();
    let res_body = response.json::<serde_json::Value>().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok((status, Json(res_body)))
}

// DELETE /api/tasks/{id}
async fn delete_task(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let response = state
        .http_client
        .delete(format!("{}/api/tasks/{}", state.backend_url, id))
        .send()
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, e.to_string()))?;

    let status = response.status();
    if status == StatusCode::NO_CONTENT {
        Ok((status, Json(serde_json::json!({}))))
    } else {
        let res_body = response.json::<serde_json::Value>().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        Ok((status, Json(res_body)))
    }
}

// GET /api/health
async fn health_check() -> impl IntoResponse {
    Json(serde_json::json!({"status": "ok", "service": "gateway"}))
}

// POST /api/upload
async fn upload_screenshot(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    if let Some(field) = multipart.next_field().await.map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))? {
        let file_name = field.file_name().unwrap_or("upload.jpg").to_string();
        let content_type = field.content_type().unwrap_or("image/jpeg").to_string();
        let data = field.bytes().await.map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

        // 1. Save file locally for UI display
        let timestamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
        let safe_name = file_name.replace(" ", "_").replace("/", "_");
        let new_file_name = format!("{}_{}", timestamp, safe_name);
        let save_path = format!("static/uploads/{}", new_file_name);
        let _ = tokio::fs::write(&save_path, &data).await;

        let part = reqwest::multipart::Part::bytes(data.to_vec())
            .file_name(file_name)
            .mime_str(&content_type)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        let form = reqwest::multipart::Form::new().part("file", part);

        let response = state.http_client
            .post(format!("{}/extract-tasks", state.ai_service_url))
            .multipart(form)
            .send()
            .await
            .map_err(|e| (StatusCode::BAD_GATEWAY, e.to_string()))?;

        let status = response.status();
        let mut body = response.json::<serde_json::Value>().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        // 2. Inject the source_image path into the JSON so the C++ backend stores it
        if let Some(obj) = body.as_object_mut() {
            obj.insert("source_image".to_string(), serde_json::json!(format!("/uploads/{}", new_file_name)));
        }

        // Forward task to backend to save it
        if status.is_success() {
            let _ = state.http_client
                .post(format!("{}/api/tasks/ocr-import", state.backend_url))
                .json(&body)
                .send()
                .await;
        }

        Ok((status, Json(body)))
    } else {
        Err((StatusCode::BAD_REQUEST, "Missing file field".to_string()))
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "screenshot_graveyard_frontend=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let http_client = HttpClient::builder()
        .timeout(Duration::from_secs(60))
        .pool_idle_timeout(Duration::from_secs(90))
        .build()?;

    let state = AppState {
        http_client,
        ai_service_url: std::env::var("AI_SERVICE_URL")
            .unwrap_or_else(|_| "http://localhost:8000".to_string()),
        backend_url: std::env::var("BACKEND_URL")
            .unwrap_or_else(|_| "http://localhost:8081".to_string()),
    };

    let cors = CorsLayer::new()
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
        .allow_origin(Any)
        .allow_headers(Any);

    let protected_routes = Router::new()
        .route("/tasks", get(list_tasks))
        .route("/tasks/:id", get(get_task).put(update_task).delete(delete_task))
        .route("/upload", post(upload_screenshot))
        .layer(middleware::from_fn(auth::auth_middleware));

    let auth_routes = Router::new()
        .route("/request-otp", post(auth::request_otp))
        .route("/verify-otp", post(auth::verify_otp));

    let api_routes = Router::new()
        .nest("/auth", auth_routes)
        .merge(protected_routes)
        .route("/health", get(health_check));

    let app = Router::new()
        .nest("/api", api_routes)
        .fallback_service(
            ServeDir::new("static").fallback(ServeFile::new("static/index.html")),
        )
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 3001));
    tracing::info!("Listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    tracing::info!("signal received, starting graceful shutdown");
}
