#pragma once
#include <string>
#include <nlohmann/json.hpp>

struct Task {
    int id = 0;
    std::string title;
    std::string description;
    std::string due_date;
    std::string priority = "medium";
    std::string status = "pending";
    std::string source = "manual";
    std::string source_image;
    std::string raw_ocr_text;
    double confidence = 1.0;
    bool is_important = true;
    std::string created_at;
    std::string updated_at;

    nlohmann::json to_json() const {
        return nlohmann::json{
            {"id", id}, {"title", title}, {"description", description},
            {"due_date", due_date}, {"priority", priority}, {"status", status},
            {"source", source}, {"source_image", source_image}, {"raw_ocr_text", raw_ocr_text},
            {"confidence", confidence}, {"is_important", is_important}, 
            {"created_at", created_at}, {"updated_at", updated_at}
        };
    }

    static Task from_json(const nlohmann::json& j) {
        Task t;
        if (j.contains("id") && j["id"].is_number()) t.id = j["id"].get<int>();
        t.title        = j.value("title", "");
        t.description  = j.value("description", "");
        t.due_date     = j.value("due_date", "");
        t.priority     = j.value("priority", "medium");
        t.status       = j.value("status", "pending");
        t.source       = j.value("source", "manual");
        t.source_image = j.value("source_image", "");
        t.raw_ocr_text = j.value("raw_ocr_text", "");
        t.confidence   = j.value("confidence", 1.0);
        t.is_important = j.value("is_important", true);
        return t;
    }
};
