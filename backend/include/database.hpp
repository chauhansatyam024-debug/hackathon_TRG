#pragma once
#include "models.hpp"
#include <sqlite3.h>
#include <mutex>
#include <vector>
#include <optional>
#include <string>

class Database {
public:
    explicit Database(const std::string& db_path);
    ~Database();

    int createTask(const Task& task);
    std::vector<int> createTasksBatch(const std::vector<Task>& tasks);
    std::optional<Task> getTaskById(int id);
    std::vector<Task> getTasks(const std::string& status = "", const std::string& date = "", const std::string& source = "");
    bool updateTask(int id, const Task& task);
    bool deleteTask(int id);

private:
    sqlite3* db_ = nullptr;
    mutable std::mutex mtx_;
    void init();
    static std::string safe_text(sqlite3_stmt* stmt, int col);
};
