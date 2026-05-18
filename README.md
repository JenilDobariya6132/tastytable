# TastyTable

A recipe sharing website built with Node.js, Express, and MySQL.

## Prerequisites

- [Node.js](https://nodejs.org/) (v14 or higher recommended)
- [MySQL](https://www.mysql.com/) (Optional, for persistent data storage)

## Installation

1.  **Clone the repository** (if you haven't already):
    ```bash
    git clone <repository-url>
    cd <project-folder>
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Database Setup (Optional)**:
    - If you want to save recipes permanently, you need a MySQL database.
    - Create a `.env` file in the root directory (copy from `.env.example` if available) and add your database credentials:
      ```env
      MYSQL_HOST=localhost
      MYSQL_USER=root
      MYSQL_PASSWORD=your_password
      MYSQL_DATABASE=tastytable
      ```
    - The application will automatically create the necessary tables on startup if the database connection is successful.
    - *Note: If no database is connected, the app will run in "Static Mode", where changes are not saved permanently.*

## Running the Project

1.  **Start the server**:
    ```bash
    npm start
    ```
    Or manually:
    ```bash
    node server.js
    ```

2.  **Open in Browser**:
    - Go to: [http://localhost:3000](http://localhost:3000)

## Features

- **Home**: Hero section with search.
- **Recipes**: Browse recipes by category or search.
- **Add Recipe**: Upload your own recipes with images and videos (Max 2GB).
- **User/Admin**: Basic authentication system.

## Troubleshooting

- **"Failed to fetch" error**: Ensure you are accessing the site via `http://localhost:3000` and NOT by opening the HTML files directly (e.g., `file://...`).
- **Database Connection Error**: Check your `.env` file and ensure your MySQL server is running.
