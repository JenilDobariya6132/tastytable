# How to Publish TastyTable

This website uses **Node.js** for the server and **MySQL** for the database. To publish it online, you need a hosting provider that supports these technologies.

We recommend using **Render.com** for the website hosting and **Aiven** (or any other MySQL provider) for the database.

## Prerequisites

1.  **GitHub Account**: You need to push this code to a GitHub repository.
2.  **Render Account**: Sign up at [render.com](https://render.com).
3.  **MySQL Database**: You need a hosted MySQL database. Aiven offers a free tier.

## Step 1: Push Code to GitHub

1.  Create a new repository on GitHub.
2.  Initialize git in this folder (if not already done):
    ```bash
    git init
    git add .
    git commit -m "Initial commit"
    git branch -M main
    git remote add origin <your-github-repo-url>
    git push -u origin main
    ```

## Step 2: Set up the Database (Free MySQL on Aiven)

1.  Go to [Aiven.io](https://aiven.io) and sign up.
2.  Create a new **MySQL** service (select the Free plan if available, or use a trial).
3.  Once created, copy the **Service URI** (it looks like `mysql://user:password@host:port/defaultdb?ssl-mode=REQUIRED`).
    *   Note: You will need the Host, Port, User, Password, and Database Name separately for the environment variables later.

## Step 3: Deploy to Render

1.  Log in to your **Render** dashboard.
2.  Click **New +** -> **Web Service**.
3.  Connect your GitHub repository.
4.  Configure the service:
    *   **Name**: `tastytable` (or anything you like)
    *   **Runtime**: `Node`
    *   **Build Command**: `npm install`
    *   **Start Command**: `node server.js`
    *   **Instance Type**: Free
5.  Scroll down to **Environment Variables** and add the following (using details from your database):
    *   `MYSQL_HOST`: The hostname of your database (e.g., `mysql-service.aivencloud.com`)
    *   `MYSQL_USER`: Your database username (e.g., `avnadmin`)
    *   `MYSQL_PASSWORD`: Your database password
    *   `MYSQL_DATABASE`: The database name (e.g., `defaultdb` or `tastytable`)
    *   `PORT`: `3000` (Render sets this automatically, but good to be safe)
6.  Click **Create Web Service**.

## Step 4: Verify

Render will build your app and start it. Watch the logs.
*   If the database connects successfully, you will see `Server running...`.
*   If the database connection fails, check your Environment Variables in Render.

## Alternative: Run Locally

To run this site on your own computer:

1.  Install [Node.js](https://nodejs.org/).
2.  Install [MySQL](https://dev.mysql.com/downloads/installer/).
3.  Create a database named `tastytable`.
4.  Create a `.env` file in this folder with your local database credentials:
    ```
    MYSQL_HOST=localhost
    MYSQL_USER=root
    MYSQL_PASSWORD=your_password
    MYSQL_DATABASE=tastytable
    ```
5.  Run the commands:
    ```bash
    npm install
    npm start
    ```
6.  Open `http://localhost:3000` in your browser.
