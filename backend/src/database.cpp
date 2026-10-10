#include "database.hpp"
#include <iostream>

Database::Database(const std::string& db_path) {
    if (sqlite3_open(db_path.c_str(), &db_) != SQLITE_OK) {
        std::cerr << "Failed to open database" << std::endl;
    } else {
        init();
    }
}

Database::~Database() {
    if (db_) {
        sqlite3_close(db_);
    }
}

std::string Database::safe_text(sqlite3_stmt* stmt, int col) {
    auto text = sqlite3_column_text(stmt, col);
    return text ? reinterpret_cast<const char*>(text) : "";
}

void Database::init() {
    char* err_msg = nullptr;
    sqlite3_exec(db_, "PRAGMA journal_mode=WAL;", nullptr, nullptr, &err_msg);
    if (err_msg) {
        sqlite3_free(err_msg);
    }

    const char* create_table_sql = 
        "CREATE TABLE IF NOT EXISTS tasks ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "title TEXT NOT NULL, "
        "description TEXT, "
        "due_date TEXT, "
        "priority TEXT DEFAULT 'medium', "
        "status TEXT DEFAULT 'pending', "
        "source TEXT DEFAULT 'manual', "
        "source_image TEXT, "
        "raw_ocr_text TEXT, "
        "confidence REAL DEFAULT 1.0, "
        "is_important INTEGER DEFAULT 1, "
        "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
        "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP"
        ");"
        "CREATE INDEX IF NOT EXISTS idx_due_date ON tasks(due_date);"
        "CREATE INDEX IF NOT EXISTS idx_status ON tasks(status);";

    sqlite3_exec(db_, create_table_sql, nullptr, nullptr, &err_msg);
    if (err_msg) sqlite3_free(err_msg);

    // Migration for existing databases
    sqlite3_exec(db_, "ALTER TABLE tasks ADD COLUMN source_image TEXT;", nullptr, nullptr, nullptr);
}

int Database::createTask(const Task& task) {
    std::lock_guard<std::mutex> lock(mtx_);
    const char* sql = "INSERT INTO tasks (title, description, due_date, priority, status, source, source_image, raw_ocr_text, confidence, is_important) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);";
    sqlite3_stmt* stmt;
    if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) {
        return -1;
    }
    sqlite3_bind_text(stmt, 1, task.title.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 2, task.description.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 3, task.due_date.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 4, task.priority.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 5, task.status.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 6, task.source.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 7, task.source_image.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 8, task.raw_ocr_text.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_double(stmt, 9, task.confidence);
    sqlite3_bind_int(stmt, 10, task.is_important ? 1 : 0);

    if (sqlite3_step(stmt) != SQLITE_DONE) {
        sqlite3_finalize(stmt);
        return -1;
    }
    int id = sqlite3_last_insert_rowid(db_);
    sqlite3_finalize(stmt);
    return id;
}

std::vector<int> Database::createTasksBatch(const std::vector<Task>& tasks) {
    std::lock_guard<std::mutex> lock(mtx_);
    std::vector<int> ids;
    char* err_msg = nullptr;
    sqlite3_exec(db_, "BEGIN TRANSACTION;", nullptr, nullptr, &err_msg);
    
    const char* sql = "INSERT INTO tasks (title, description, due_date, priority, status, source, source_image, raw_ocr_text, confidence, is_important) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);";
    sqlite3_stmt* stmt;
    if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) {
        sqlite3_exec(db_, "ROLLBACK;", nullptr, nullptr, nullptr);
        return ids;
    }

    for (const auto& task : tasks) {
        sqlite3_bind_text(stmt, 1, task.title.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 2, task.description.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 3, task.due_date.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 4, task.priority.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 5, task.status.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 6, task.source.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 7, task.source_image.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 8, task.raw_ocr_text.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_double(stmt, 9, task.confidence);
        sqlite3_bind_int(stmt, 10, task.is_important ? 1 : 0);

        if (sqlite3_step(stmt) == SQLITE_DONE) {
            ids.push_back(sqlite3_last_insert_rowid(db_));
        }
        sqlite3_reset(stmt);
    }
    
    sqlite3_finalize(stmt);
    sqlite3_exec(db_, "COMMIT;", nullptr, nullptr, &err_msg);
    return ids;
}

std::optional<Task> Database::getTaskById(int id) {
    std::lock_guard<std::mutex> lock(mtx_);
    const char* sql = "SELECT id, title, description, due_date, priority, status, source, source_image, raw_ocr_text, confidence, is_important, created_at, updated_at FROM tasks WHERE id = ?;";
    sqlite3_stmt* stmt;
    if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) return std::nullopt;
    
    sqlite3_bind_int(stmt, 1, id);
    
    std::optional<Task> task = std::nullopt;
    if (sqlite3_step(stmt) == SQLITE_ROW) {
        Task t;
        t.id = sqlite3_column_int(stmt, 0);
        t.title = safe_text(stmt, 1);
        t.description = safe_text(stmt, 2);
        t.due_date = safe_text(stmt, 3);
        t.priority = safe_text(stmt, 4);
        t.status = safe_text(stmt, 5);
        t.source = safe_text(stmt, 6);
        t.source_image = safe_text(stmt, 7);
        t.raw_ocr_text = safe_text(stmt, 8);
        t.confidence = sqlite3_column_double(stmt, 9);
        t.is_important = sqlite3_column_int(stmt, 10) != 0;
        t.created_at = safe_text(stmt, 11);
        t.updated_at = safe_text(stmt, 12);
        task = t;
    }
    sqlite3_finalize(stmt);
    return task;
}

std::vector<Task> Database::getTasks(const std::string& status, const std::string& date, const std::string& source) {
    std::lock_guard<std::mutex> lock(mtx_);
    std::vector<Task> tasks;
    std::string sql = "SELECT id, title, description, due_date, priority, status, source, source_image, raw_ocr_text, confidence, is_important, created_at, updated_at FROM tasks WHERE 1=1";
    
    if (!status.empty()) sql += " AND status = ?";
    if (!date.empty()) sql += " AND date(due_date) = date(?)";
    if (!source.empty()) sql += " AND source = ?";
    
    sql += " ORDER BY due_date ASC, id DESC;";
    
    sqlite3_stmt* stmt;
    if (sqlite3_prepare_v2(db_, sql.c_str(), -1, &stmt, nullptr) != SQLITE_OK) return tasks;
    
    int param_idx = 1;
    if (!status.empty()) sqlite3_bind_text(stmt, param_idx++, status.c_str(), -1, SQLITE_TRANSIENT);
    if (!date.empty()) sqlite3_bind_text(stmt, param_idx++, date.c_str(), -1, SQLITE_TRANSIENT);
    if (!source.empty()) sqlite3_bind_text(stmt, param_idx++, source.c_str(), -1, SQLITE_TRANSIENT);
    
    while (sqlite3_step(stmt) == SQLITE_ROW) {
        Task t;
        t.id = sqlite3_column_int(stmt, 0);
        t.title = safe_text(stmt, 1);
        t.description = safe_text(stmt, 2);
        t.due_date = safe_text(stmt, 3);
        t.priority = safe_text(stmt, 4);
        t.status = safe_text(stmt, 5);
        t.source = safe_text(stmt, 6);
        t.source_image = safe_text(stmt, 7);
        t.raw_ocr_text = safe_text(stmt, 8);
        t.confidence = sqlite3_column_double(stmt, 9);
        t.is_important = sqlite3_column_int(stmt, 10) != 0;
        t.created_at = safe_text(stmt, 11);
        t.updated_at = safe_text(stmt, 12);
        tasks.push_back(t);
    }
    sqlite3_finalize(stmt);
    return tasks;
}

bool Database::updateTask(int id, const Task& task) {
    std::lock_guard<std::mutex> lock(mtx_);
    const char* sql = "UPDATE tasks SET title = ?, description = ?, due_date = ?, priority = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;";
    sqlite3_stmt* stmt;
    if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) return false;
    
    sqlite3_bind_text(stmt, 1, task.title.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 2, task.description.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 3, task.due_date.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 4, task.priority.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 5, task.status.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_int(stmt, 6, id);
    
    bool success = sqlite3_step(stmt) == SQLITE_DONE;
    sqlite3_finalize(stmt);
    return success;
}

bool Database::deleteTask(int id) {
    std::lock_guard<std::mutex> lock(mtx_);
    const char* sql = "DELETE FROM tasks WHERE id = ?;";
    sqlite3_stmt* stmt;
    if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) return false;
    
    sqlite3_bind_int(stmt, 1, id);
    
    bool success = sqlite3_step(stmt) == SQLITE_DONE;
    sqlite3_finalize(stmt);
    return success;
}
