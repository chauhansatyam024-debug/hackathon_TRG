cmake_minimum_required(VERSION 3.16)
project(task_management_service CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include(FetchContent)

FetchContent_Declare(
    Crow
    GIT_REPOSITORY https://github.com/CrowCpp/Crow.git
    GIT_TAG        v1.2.0
)

FetchContent_Declare(
    json
    URL https://github.com/nlohmann/json/releases/download/v3.11.3/json.tar.xz
)

FetchContent_MakeAvailable(Crow json)

find_package(SQLite3 REQUIRED)
find_package(Threads REQUIRED)

add_executable(task_server
    src/main.cpp
    src/database.cpp
)

target_include_directories(task_server PRIVATE include)

target_link_libraries(task_server PRIVATE
    Crow::Crow
    nlohmann_json::nlohmann_json
    SQLite::SQLite3
    Threads::Threads
)
