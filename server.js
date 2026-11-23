
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const db = require("./db");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: "10kb" }));

// Check required settings
if (
    !process.env.ADMIN_EMAIL ||
    !process.env.ADMIN_PASSWORD_HASH ||
    !process.env.JWT_SECRET
) {
    console.error("Missing security settings in .env file.");
    process.exit(1);
}

// Home route
app.get("/", (req, res) => {
    res.send("Welcome to Learnive Backend!");
});

// Admin login route
app.post("/api/admin/login", async (req, res) => {
    try {
        const { email, password } = req.body || {};

        if (
            typeof email !== "string" ||
            typeof password !== "string" ||
            !email.trim() ||
            !password
        ) {
            return res.status(400).json({
                status: "error",
                message: "Email and password are required."
            });
        }

        if (
            email.trim().toLowerCase() !==
            process.env.ADMIN_EMAIL.trim().toLowerCase()
        ) {
            return res.status(401).json({
                status: "error",
                message: "Invalid email or password."
            });
        }

        const passwordMatch = await bcrypt.compare(
            password,
            process.env.ADMIN_PASSWORD_HASH
        );

        if (!passwordMatch) {
            return res.status(401).json({
                status: "error",
                message: "Invalid email or password."
            });
        }

        const token = jwt.sign(
            { email: process.env.ADMIN_EMAIL },
            process.env.JWT_SECRET,
            {
                expiresIn: "2h",
                algorithm: "HS256"
            }
        );

        return res.json({
            status: "success",
            message: "Admin login successful!",
            token
        });

    } catch (error) {
        console.error("Login error:", error.message);

        return res.status(500).json({
            status: "error",
            message: "Login failed."
        });
    }
});

// Admin authentication
function verifyAdmin(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            status: "error",
            message: "Admin login required."
        });
    }

    try {
        const token = authHeader.split(" ")[1];

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET,
            { algorithms: ["HS256"] }
        );

        if (
            typeof decoded.email !== "string" ||
            decoded.email !== process.env.ADMIN_EMAIL
        ) {
            return res.status(403).json({
                status: "error",
                message: "Access denied."
            });
        }

        req.admin = decoded;
        next();

    } catch (error) {
        return res.status(401).json({
            status: "error",
            message: "Invalid or expired login. Please log in again."
        });
    }
}

// Database status
app.get("/api/status", async (req, res) => {
    try {
        await db.query("SELECT 1");

        res.json({
            project: "Learnive",
            database: "Connected",
            status: "success"
        });

    } catch (error) {
        console.error("Database error:", error.message);

        res.status(500).json({
            status: "error",
            message: "Database connection failed."
        });
    }
});

// Register customer
app.post("/api/customers", async (req, res) => {
    let connection;

    try {
        const { customer_name, service } = req.body || {};

        if (
            typeof customer_name !== "string" ||
            typeof service !== "string"
        ) {
            return res.status(400).json({
                status: "error",
                message: "Valid customer name and service are required."
            });
        }

        const name = customer_name.trim();

        if (!name || name.length > 100) {
            return res.status(400).json({
                status: "error",
                message: "Customer name must be between 1 and 100 characters."
            });
        }

        const allowedServices = [
            "Student Support",
            "Library",
            "Accounts",
            "Administration"
        ];

        if (!allowedServices.includes(service)) {
            return res.status(400).json({
                status: "error",
                message: "Invalid service selected."
            });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        const temporaryToken =
            "P" + crypto.randomBytes(9).toString("hex");

        const [result] = await connection.query(
            `INSERT INTO customers
            (token, customer_name, service, status)
            VALUES (?, ?, ?, 'Waiting')`,
            [temporaryToken, name, service]
        );

        const token =
            "T" + String(result.insertId).padStart(3, "0");

        await connection.query(
            "UPDATE customers SET token = ? WHERE id = ?",
            [token, result.insertId]
        );

        await connection.commit();

        res.status(201).json({
            status: "success",
            message: "Customer registered successfully!",
            customer: {
                id: result.insertId,
                token,
                customer_name: name,
                service,
                status: "Waiting"
            }
        });

    } catch (error) {
        if (connection) await connection.rollback();

        console.error("Registration error:", error.message);

        res.status(500).json({
            status: "error",
            message: "Customer registration failed."
        });

    } finally {
        if (connection) connection.release();
    }
});

// View customers
app.get("/api/customers", async (req, res) => {
    try {
        const [customers] = await db.query(
            `SELECT id, token, customer_name, service, status, created_at
             FROM customers
             ORDER BY id ASC`
        );

        res.json(customers);

    } catch (error) {
        console.error("Customer list error:", error.message);

        res.status(500).json({
            status: "error",
            message: "Unable to load customers."
        });
    }
});

// Call next customer
app.post("/api/customers/next", verifyAdmin, async (req, res) => {
    let connection;

    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const [current] = await connection.query(
            "SELECT id FROM customers WHERE status = 'Serving' FOR UPDATE"
        );

        if (current.length > 0) {
            await connection.rollback();

            return res.status(409).json({
                status: "error",
                message: "Complete the current customer first."
            });
        }

        const [waiting] = await connection.query(
            `SELECT * FROM customers
             WHERE status = 'Waiting'
             ORDER BY id ASC
             LIMIT 1
             FOR UPDATE`
        );

        if (waiting.length === 0) {
            await connection.rollback();

            return res.json({
                status: "success",
                message: "No waiting customers."
            });
        }

        await connection.query(
            "UPDATE customers SET status = 'Serving' WHERE id = ?",
            [waiting[0].id]
        );

        await connection.commit();

        res.json({
            status: "success",
            message: "Next customer called successfully!",
            customer: {
                ...waiting[0],
                status: "Serving"
            }
        });

    } catch (error) {
        if (connection) await connection.rollback();

        console.error("Next customer error:", error.message);

        res.status(500).json({
            status: "error",
            message: "Unable to call next customer."
        });

    } finally {
        if (connection) connection.release();
    }
});

// Complete customer
app.post("/api/customers/:token/complete", verifyAdmin, async (req, res) => {
    try {
        const [result] = await db.query(
            `UPDATE customers
             SET status = 'Completed'
             WHERE token = ? AND status = 'Serving'`,
            [req.params.token]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                status: "error",
                message: "Serving customer not found."
            });
        }

        res.json({
            status: "success",
            message: "Customer marked as completed."
        });

    } catch (error) {
        console.error("Completion error:", error.message);

        res.status(500).json({
            status: "error",
            message: "Unable to complete customer."
        });
    }
});

// Cancel waiting token
app.post("/api/customers/:token/cancel", async (req, res) => {
    try {
        const [result] = await db.query(
            `UPDATE customers
             SET status = 'Cancelled'
             WHERE token = ? AND status = 'Waiting'`,
            [req.params.token]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                status: "error",
                message: "Waiting customer not found."
            });
        }

        res.json({
            status: "success",
            message: "Token cancelled successfully."
        });

    } catch (error) {
        console.error("Cancellation error:", error.message);

        res.status(500).json({
            status: "error",
            message: "Unable to cancel token."
        });
    }
});

// Unknown routes
app.use((req, res) => {
    res.status(404).json({
        status: "error",
        message: "Route not found."
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Learnive server running at http://localhost:${PORT}`);
});
