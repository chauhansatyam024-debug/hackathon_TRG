use axum::{
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use jsonwebtoken::{encode, decode, Header, Validation, EncodingKey, DecodingKey};
use lettre::{Message, SmtpTransport, Transport, transport::smtp::authentication::Credentials};
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::Mutex, env};
use lazy_static::lazy_static;
use axum::{
    extract::Request,
    middleware::Next,
    response::Response,
};

lazy_static! {
    static ref OTP_STORE: Mutex<HashMap<String, String>> = Mutex::new(HashMap::new());
}

#[derive(Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub exp: usize,
}

#[derive(Deserialize)]
pub struct RequestOtpReq {
    pub email: String,
}

#[derive(Deserialize)]
pub struct VerifyOtpReq {
    pub email: String,
    pub otp: String,
}

pub async fn request_otp(Json(payload): Json<RequestOtpReq>) -> impl IntoResponse {
    let mut rng = rand::thread_rng();
    let otp: String = (0..6).map(|_| rng.gen_range(0..10).to_string()).collect();
    
    // Store OTP
    {
        let mut store = OTP_STORE.lock().unwrap();
        store.insert(payload.email.clone(), otp.clone());
    }

    let smtp_user = env::var("SMTP_USERNAME").unwrap_or_default();
    let smtp_pass = env::var("SMTP_PASSWORD").unwrap_or_default();
    
    if smtp_user.is_empty() {
        // Mock email for testing without SMTP
        tracing::info!("Mock Email - To: {}, OTP: {}", payload.email, otp);
        return (StatusCode::OK, Json(serde_json::json!({"message": "OTP generated (check console)"})));
    }

    let email = Message::builder()
        .from(smtp_user.parse().unwrap())
        .to(payload.email.parse().unwrap())
        .subject("Your Screenshot Graveyard Login Code")
        .body(format!("Your one-time password is: {}", otp))
        .unwrap();

    let creds = Credentials::new(smtp_user.clone(), smtp_pass);
    let mailer = SmtpTransport::relay("smtp.gmail.com") // Assume gmail for hackathon
        .unwrap()
        .credentials(creds)
        .build();

    match mailer.send(&email) {
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({"message": "OTP sent to email"}))),
        Err(e) => {
            tracing::error!("Could not send email: {:?}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": "Failed to send email"})))
        }
    }
}

pub async fn verify_otp(Json(payload): Json<VerifyOtpReq>) -> impl IntoResponse {
    let mut is_valid = false;
    {
        let mut store = OTP_STORE.lock().unwrap();
        if let Some(stored_otp) = store.get(&payload.email) {
            if stored_otp == &payload.otp {
                is_valid = true;
                store.remove(&payload.email);
            }
        }
    }

    if !is_valid {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error": "Invalid OTP"})));
    }

    let exp = chrono::Utc::now()
        .checked_add_signed(chrono::Duration::days(7))
        .expect("valid timestamp")
        .timestamp() as usize;

    let claims = Claims {
        sub: payload.email,
        exp,
    };

    let secret = env::var("JWT_SECRET").unwrap_or_else(|_| "hackathon_secret".to_string());
    let token = encode(&Header::default(), &claims, &EncodingKey::from_secret(secret.as_ref())).unwrap();

    (StatusCode::OK, Json(serde_json::json!({"token": token})))
}

pub async fn auth_middleware(req: Request, next: Next) -> Result<Response, StatusCode> {
    let auth_header = req.headers().get("Authorization");
    
    if let Some(auth_header) = auth_header {
        if let Ok(auth_str) = auth_header.to_str() {
            if auth_str.starts_with("Bearer ") {
                let token = &auth_str[7..];
                let secret = env::var("JWT_SECRET").unwrap_or_else(|_| "hackathon_secret".to_string());
                let validation = Validation::default();
                
                if decode::<Claims>(token, &DecodingKey::from_secret(secret.as_ref()), &validation).is_ok() {
                    return Ok(next.run(req).await);
                }
            }
        }
    }
    
    Err(StatusCode::UNAUTHORIZED)
}
