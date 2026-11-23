
const API_URL = "http://localhost:3000/api";

let queue = [];
let currentCustomer = null;
let completedCustomers = 0;
let totalCustomers = 0;
let myActiveToken = null;
let customerHistory = [];
let serviceChart = null;

let adminToken = sessionStorage.getItem("learniveAdminToken");

const services = [
    "Student Support",
    "Library",
    "Accounts",
    "Administration"
];

const serviceTotals = {
    "Student Support": 0,
    "Library": 0,
    "Accounts": 0,
    "Administration": 0
};

// SAFELY READ SERVER RESPONSE
async function readResponse(response) {
    const text = await response.text();

    try {
        return text ? JSON.parse(text) : {};
    } catch {
        throw new Error(
            `Server returned an unexpected response (HTTP ${response.status}). ` +
            "Please check the backend API route."
        );
    }
}

// ADMIN HEADERS
function getAdminHeaders() {
    return {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + adminToken
    };
}

// LOAD CUSTOMERS FROM MYSQL
async function loadCustomers() {
    try {
        const response = await fetch(`${API_URL}/customers`);
        const customers = await readResponse(response);

        if (!response.ok) {
            throw new Error(customers.message || "Could not load customers.");
        }

        queue = customers
            .filter(c => c.status === "Waiting")
            .map(c => ({
                name: c.customer_name,
                service: c.service,
                token: c.token,
                status: c.status
            }));

        currentCustomer = customers
            .filter(c => c.status === "Serving")
            .map(c => ({
                name: c.customer_name,
                service: c.service,
                token: c.token,
                status: c.status
            }))[0] || null;

        customerHistory = customers
            .filter(c => c.status === "Completed")
            .map(c => ({
                name: c.customer_name,
                service: c.service,
                token: c.token,
                status: c.status
            }))
            .reverse();

        totalCustomers = customers.length;
        completedCustomers = customerHistory.length;

        Object.keys(serviceTotals).forEach(service => {
            serviceTotals[service] =
                customers.filter(c => c.service === service).length;
        });

        updateDashboard();

    } catch (error) {
        console.error("Database error:", error);
    }
}

// JOIN QUEUE
async function joinQueue() {
    const name = document.getElementById("student-name").value.trim();
    const service = document.getElementById("service").value;

    if (!name || !service) {
        alert("Please enter your name and select a service.");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/customers`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                customer_name: name,
                service: service
            })
        });

        const data = await readResponse(response);

        if (!response.ok) {
            throw new Error(data.message || "Registration failed.");
        }

        myActiveToken = data.customer.token;

        document.getElementById("my-token").textContent =
            data.customer.token;

        document.getElementById("token-message").textContent =
            "Your token has been generated successfully!";

        document.getElementById("token-details").textContent =
            "Service: " + service + " | Status: Waiting";

        document.getElementById("student-name").value = "";
        document.getElementById("service").value = "";

        await loadCustomers();

        alert("Customer registered successfully!");

    } catch (error) {
        alert(error.message);
    }
}

// CANCEL TOKEN
async function cancelToken() {
    if (!myActiveToken) {
        alert("No active token to cancel.");
        return;
    }

    try {
        const response = await fetch(
            `${API_URL}/customers/${encodeURIComponent(myActiveToken)}/cancel`,
            { method: "POST" }
        );

        const data = await readResponse(response);

        if (!response.ok) {
            throw new Error(data.message || "Could not cancel token.");
        }

        document.getElementById("token-message").textContent =
            "Your token has been cancelled.";

        document.getElementById("token-details").textContent =
            "Status: Cancelled";

        myActiveToken = null;

        await loadCustomers();

        alert("Token cancelled successfully!");

    } catch (error) {
        alert(error.message);
    }
}

// TRACK CUSTOMER STATUS
async function trackCustomer() {
    const token = document.getElementById("track-token")
        .value.trim().toUpperCase();

    const tokenElement = document.getElementById("tracking-token");
    const nameElement = document.getElementById("tracking-name");
    const serviceElement = document.getElementById("tracking-service");
    const statusElement = document.getElementById("tracking-status");
    const messageElement = document.getElementById("tracking-message");

    if (!token) {
        messageElement.textContent = "Please enter your token number.";
        return;
    }

    try {
        const response = await fetch(`${API_URL}/customers`);
        const customers = await readResponse(response);

        if (!response.ok) {
            throw new Error("Unable to connect to the server.");
        }

        const customer = customers.find(
            c => c.token.toUpperCase() === token
        );

        if (!customer) {
            tokenElement.textContent = "Token Not Found";
            nameElement.textContent = "Customer Name: --";
            serviceElement.textContent = "Service: --";
            statusElement.textContent = "Status: --";
            messageElement.textContent = "Please check your token number.";
            return;
        }

        tokenElement.textContent = "Token: " + customer.token;
        nameElement.textContent =
            "Customer Name: " + customer.customer_name;
        serviceElement.textContent =
            "Service: " + customer.service;
        statusElement.textContent =
            "Status: " + customer.status;

        const messages = {
            "Waiting": "Please wait. Your turn is coming soon!",
            "Serving": "Your turn has arrived. Please proceed!",
            "Completed": "Your service has been completed.",
            "Cancelled": "This token has been cancelled."
        };

        messageElement.textContent =
            messages[customer.status] || "Status updated.";

    } catch (error) {
        messageElement.textContent = error.message;
    }
}

// ADMIN LOGIN
async function loginAdmin() {
    const email = document.getElementById("admin-email").value.trim();
    const password = document.getElementById("admin-password").value;
    const message = document.getElementById("login-message");

    if (!email || !password) {
        message.textContent = "Please enter email and password.";
        return;
    }

    try {
        message.textContent = "Checking login...";

        const response = await fetch(`${API_URL}/admin/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email: email,
                password: password
            })
        });

        const data = await readResponse(response);

        if (!response.ok) {
            throw new Error(data.message || "Login failed.");
        }

        if (!data.token) {
            throw new Error("Server did not return an admin login token.");
        }

        adminToken = data.token;

        sessionStorage.setItem("learniveAdminToken", adminToken);

        document.getElementById("admin-login").hidden = true;
        document.getElementById("admin").hidden = false;

        message.textContent = "";

        await loadCustomers();

    } catch (error) {
        adminToken = null;
        sessionStorage.removeItem("learniveAdminToken");
        message.textContent = error.message;
    }
}

// SHOW OR HIDE PASSWORD
function togglePassword() {
    const field = document.getElementById("admin-password");

    field.type = field.type === "password" ? "text" : "password";
}

// HANDLE EXPIRED ADMIN LOGIN
function handleAdminAuthError(message) {
    adminToken = null;
    sessionStorage.removeItem("learniveAdminToken");

    document.getElementById("admin").hidden = true;
    document.getElementById("admin-login").hidden = false;

    document.getElementById("login-message").textContent =
        message || "Please log in again.";
}

// CALL NEXT CUSTOMER
async function callNextCustomer() {
    const message = document.getElementById("admin-message");

    if (!adminToken) {
        handleAdminAuthError("Please log in as admin.");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/customers/next`, {
            method: "POST",
            headers: getAdminHeaders()
        });

        const data = await readResponse(response);

        if (response.status === 401 || response.status === 403) {
            handleAdminAuthError(data.message);
            return;
        }

        if (!response.ok) {
            throw new Error(data.message || "Could not call next customer.");
        }

        await loadCustomers();

        message.textContent = data.message;

        if (data.customer && myActiveToken === data.customer.token) {
            document.getElementById("token-details").textContent =
                "Service: " + data.customer.service + " | Status: Serving";
        }

    } catch (error) {
        message.textContent = error.message;
    }
}

// COMPLETE CUSTOMER
async function completeCustomer() {
    const message = document.getElementById("admin-message");

    if (!adminToken) {
        handleAdminAuthError("Please log in as admin.");
        return;
    }

    if (!currentCustomer) {
        message.textContent = "No customer is currently being served.";
        return;
    }

    const token = currentCustomer.token;

    try {
        const response = await fetch(
            `${API_URL}/customers/${encodeURIComponent(token)}/complete`,
            {
                method: "POST",
                headers: getAdminHeaders()
            }
        );

        const data = await readResponse(response);

        if (response.status === 401 || response.status === 403) {
            handleAdminAuthError(data.message);
            return;
        }

        if (!response.ok) {
            throw new Error(data.message || "Could not complete customer.");
        }

        if (myActiveToken === token) {
            myActiveToken = null;

            document.getElementById("token-message").textContent =
                "Your service has been completed.";

            document.getElementById("token-details").textContent =
                "Status: Completed";
        }

        await loadCustomers();

        message.textContent = data.message;

    } catch (error) {
        message.textContent = error.message;
    }
}

// SEARCH CUSTOMER
function searchCustomer() {
    const token = document.getElementById("search-token")
        .value.trim().toUpperCase();

    const result = document.getElementById("search-result");

    let customer = queue.find(item => item.token === token);

    if (!customer && currentCustomer &&
        currentCustomer.token === token) {
        customer = currentCustomer;
    }

    if (!customer) {
        customer = customerHistory.find(item => item.token === token);
    }

    if (!token) {
        result.textContent = "Please enter a token number.";
    } else if (customer) {
        result.textContent =
            "Token: " + customer.token +
            " | Customer: " + customer.name +
            " | Service: " + customer.service +
            " | Status: " + customer.status;
    } else {
        result.textContent = "Token not found.";
    }
}

// CREATE HISTORY FIELD
function createHistoryField(label, value) {
    const field = document.createElement("div");

    field.style.flex = "1 1 125px";
    field.style.minWidth = "0";
    field.style.padding = "8px";
    field.style.overflowWrap = "anywhere";

    const heading = document.createElement("strong");
    heading.textContent = label;
    heading.style.display = "block";
    heading.style.color = "#8872cf";
    heading.style.marginBottom = "6px";

    const detail = document.createElement("span");
    detail.textContent = value;

    field.appendChild(heading);
    field.appendChild(detail);

    return field;
}

// CUSTOMER HISTORY
function updateHistory() {
    const history = document.getElementById("history-list");
    history.innerHTML = "";

    if (customerHistory.length === 0) {
        history.textContent = "No completed customers yet.";
        return;
    }

    customerHistory.forEach(customer => {
        const card = document.createElement("div");
        card.className = "history-item";

        card.appendChild(createHistoryField("TOKEN", customer.token));
        card.appendChild(createHistoryField("CUSTOMER", customer.name));
        card.appendChild(createHistoryField("SERVICE", customer.service));
        card.appendChild(createHistoryField("STATUS", customer.status));

        history.appendChild(card);
    });
}

// LIVE WAITING LIST
function updateQueueList() {
    const queueList = document.getElementById("queue-list");
    queueList.innerHTML = "";

    if (queue.length === 0) {
        queueList.textContent = "No customers waiting.";
        return;
    }

    queue.forEach(customer => {
        const card = document.createElement("div");
        card.className = "queue-item";

        const token = document.createElement("h3");
        token.textContent = customer.token;

        const name = document.createElement("p");
        name.textContent = "Customer: " + customer.name;

        const service = document.createElement("p");
        service.textContent = "Service: " + customer.service;

        const status = document.createElement("p");
        status.textContent = "Status: Waiting";
        status.style.color = "#319b79";
        status.style.fontWeight = "bold";

        card.append(token, name, service, status);
        queueList.appendChild(card);
    });
}

// CURRENT SERVING TABLE
function updateCurrentServingTable() {
    const table = document.getElementById("current-serving-table");
    table.innerHTML = "";

    if (!currentCustomer) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 4;
        cell.textContent = "No customer currently serving.";

        row.appendChild(cell);
        table.appendChild(row);
        return;
    }

    const row = document.createElement("tr");

    const values = [
        currentCustomer.token,
        currentCustomer.name,
        currentCustomer.service
    ];

    values.forEach(value => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
    });

    const statusCell = document.createElement("td");
    const statusBadge = document.createElement("span");

    statusBadge.className = "serving-status";
    statusBadge.textContent = "Serving";

    statusCell.appendChild(statusBadge);
    row.appendChild(statusCell);

    table.appendChild(row);
}

// QUEUE ANALYTICS
function updateChart() {
    const canvas = document.getElementById("serviceChart");

    if (!canvas || typeof Chart === "undefined") {
        return;
    }

    const values = services.map(service => serviceTotals[service]);

    if (serviceChart) {
        serviceChart.data.datasets[0].data = values;
        serviceChart.update();
        return;
    }

    serviceChart = new Chart(canvas, {
        type: "bar",
        data: {
            labels: services,
            datasets: [{
                label: "Number of Customers",
                data: values,
                backgroundColor: [
                    "#b9a7f5",
                    "#f5b7d2",
                    "#a8d9f0",
                    "#aee3d0"
                ],
                borderRadius: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: "bottom"
                },
                title: {
                    display: true,
                    text: "Customers by Service"
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0,
                        stepSize: 1
                    }
                }
            }
        }
    });
}

// UPDATE DASHBOARD
function updateDashboard() {
    document.getElementById("current-serving").textContent =
        currentCustomer ? currentCustomer.token : "--";

    document.getElementById("waiting-count").textContent = queue.length;
    document.getElementById("wait-time").textContent =
        queue.length * 5 + " min";

    document.getElementById("total-customers").textContent = totalCustomers;
    document.getElementById("admin-waiting").textContent = queue.length;
    document.getElementById("admin-completed").textContent =
        completedCustomers;

    document.getElementById("student-support-count").textContent =
        serviceTotals["Student Support"];

    document.getElementById("library-count").textContent =
        serviceTotals["Library"];

    document.getElementById("accounts-count").textContent =
        serviceTotals["Accounts"];

    document.getElementById("administration-count").textContent =
        serviceTotals["Administration"];

    updateCurrentServingTable();
    updateQueueList();
    updateHistory();
    updateChart();
}

// ADMIN LOGOUT
function logoutAdmin() {
    adminToken = null;
    sessionStorage.removeItem("learniveAdminToken");

    document.getElementById("admin").hidden = true;
    document.getElementById("admin-login").hidden = false;

    document.getElementById("admin-email").value = "";
    document.getElementById("admin-password").value = "";

    document.getElementById("login-message").textContent =
        "You have logged out.";
}

// BUTTON EVENTS
document.getElementById("join-btn").addEventListener("click", joinQueue);
document.getElementById("cancel-btn").addEventListener("click", cancelToken);
document.getElementById("track-btn").addEventListener("click", trackCustomer);
document.getElementById("admin-login-btn").addEventListener("click", loginAdmin);
document.getElementById("toggle-password").addEventListener("click", togglePassword);
document.getElementById("next-btn").addEventListener("click", callNextCustomer);
document.getElementById("complete-btn").addEventListener("click", completeCustomer);
document.getElementById("search-btn").addEventListener("click", searchCustomer);
document.getElementById("logout-btn").addEventListener("click", logoutAdmin);

// INITIAL LOAD
updateDashboard();
loadCustomers();

// RESTORE ADMIN SESSION
if (adminToken) {
    document.getElementById("admin-login").hidden = true;
    document.getElementById("admin").hidden = false;
}

// AUTOMATIC REFRESH EVERY 5 SECONDS
setInterval(() => {
    loadCustomers();

    const trackToken = document.getElementById("track-token");

    if (trackToken && trackToken.value.trim() !== "") {
        trackCustomer();
    }
}, 5000);
