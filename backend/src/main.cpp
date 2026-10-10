#include "crow.h"
#include "crow/middlewares/cors.h"
#include "database.hpp"
#include <nlohmann/json.hpp>
#include <iostream>

using json = nlohmann::json;

int main() {
    crow::App<crow::CORSHandler> app;
    auto& cors = app.get_middleware<crow::CORSHandler>();
    cors.global()
        .headers("Content-Type", "Authorization")
        .methods("GET"_method, "POST"_method, "PUT"_method, "DELETE"_method, "OPTIONS"_method)
        .origin("*");

    Database db("tasks.db");

    auto json_response = [](int status, const json& j) {
        return crow::response(status, "application/json", j.dump());
    };

    // GET /health
    CROW_ROUTE(app, "/health")([]() {
        return crow::response(200, "application/json", "{\"status\":\"healthy\"}");
    });

    // POST /api/tasks
    CROW_ROUTE(app, "/api/tasks").methods(crow::HTTPMethod::POST)([&](const crow::request& req) {
        try {
            auto body = json::parse(req.body);
            if (!body.contains("title") || body["title"].get<std::string>().empty())
                return json_response(400, {{"error", "Field 'title' is required"}});
            Task task = Task::from_json(body);
            int new_id = db.createTask(task);
            if (new_id < 0) return json_response(500, {{"error", "Failed to store task"}});
            auto created = db.getTaskById(new_id);
            return json_response(201, {{"status", "created"}, {"task", created->to_json()}});
        } catch (const std::exception& e) {
            return json_response(400, {{"error", std::string("JSON Error: ") + e.what()}});
        }
    });

    // POST /api/tasks/ocr-import
    CROW_ROUTE(app, "/api/tasks/ocr-import").methods(crow::HTTPMethod::POST)([&](const crow::request& req) {
        try {
            auto body = json::parse(req.body);
            std::string source_img = body.value("source_image", "screenshot");
            std::string raw_ocr = body.value("raw_text", "");
            if (!body.contains("tasks") || !body["tasks"].is_array())
                return json_response(400, {{"error", "'tasks' array required"}});
            std::vector<Task> incoming;
            for (const auto& item : body["tasks"]) {
                Task t = Task::from_json(item);
                t.source = "ocr";
                if (source_img != "screenshot") t.source_image = source_img;
                if (t.raw_ocr_text.empty()) t.raw_ocr_text = raw_ocr;
                incoming.push_back(t);
            }
            auto ids = db.createTasksBatch(incoming);
            json records = json::array();
            for (int id : ids) {
                auto t = db.getTaskById(id);
                if (t) records.push_back(t->to_json());
            }
            return json_response(201, {{"status", "success"}, {"imported_count", ids.size()}, {"source_image", source_img}, {"tasks", records}});
        } catch (const std::exception& e) {
            return json_response(400, {{"error", std::string("OCR Import Error: ") + e.what()}});
        }
    });

    // GET /api/tasks
    CROW_ROUTE(app, "/api/tasks").methods(crow::HTTPMethod::GET)([&](const crow::request& req) {
        std::string status = req.url_params.get("status") ? req.url_params.get("status") : "";
        std::string date = req.url_params.get("date") ? req.url_params.get("date") : "";
        std::string source = req.url_params.get("source") ? req.url_params.get("source") : "";
        auto tasks = db.getTasks(status, date, source);
        json list = json::array();
        for (const auto& t : tasks) list.push_back(t.to_json());
        return json_response(200, {{"count", list.size()}, {"tasks", list}});
    });

    // GET /api/tasks/<int>
    CROW_ROUTE(app, "/api/tasks/<int>").methods(crow::HTTPMethod::GET)([&](int id) {
        auto task = db.getTaskById(id);
        if (!task) return json_response(404, {{"error", "Task not found"}});
        return json_response(200, task->to_json());
    });

    // PUT /api/tasks/<int>
    CROW_ROUTE(app, "/api/tasks/<int>").methods(crow::HTTPMethod::PUT)([&](const crow::request& req, int id) {
        try {
            auto current = db.getTaskById(id);
            if (!current) return json_response(404, {{"error", "Task not found"}});
            auto body = json::parse(req.body);
            Task updated = *current;
            if (body.contains("title")) updated.title = body["title"].get<std::string>();
            if (body.contains("description")) updated.description = body["description"].get<std::string>();
            if (body.contains("due_date")) updated.due_date = body["due_date"].get<std::string>();
            if (body.contains("priority")) updated.priority = body["priority"].get<std::string>();
            if (body.contains("status")) updated.status = body["status"].get<std::string>();
            if (!db.updateTask(id, updated)) return json_response(500, {{"error", "Failed to update"}});
            return json_response(200, {{"status", "updated"}, {"task", db.getTaskById(id)->to_json()}});
        } catch (const std::exception& e) {
            return json_response(400, {{"error", std::string("Update Error: ") + e.what()}});
        }
    });

    // DELETE /api/tasks/<int>
    CROW_ROUTE(app, "/api/tasks/<int>").methods(crow::HTTPMethod::DELETE)([&](int id) {
        if (!db.deleteTask(id)) return json_response(404, {{"error", "Task not found"}});
        return json_response(200, {{"status", "deleted"}, {"id", id}});
    });

    std::cout << "[TASK SERVER] Listening on http://0.0.0.0:8081" << std::endl;
    app.port(8081).multithreaded().run();
}
