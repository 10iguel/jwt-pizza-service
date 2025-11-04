const { metrics } = require("./config");
const os = require("os");

let getReqs = 0;
let postReqs = 0;
let putReqs = 0;
let delReqs = 0;
let totalReqs = 0;
let overallLatency = 0;
const requestTracker = async (req, res, next) => {
    switch (req.method) {
        case "GET":
            getReqs++;
            break;
        case "POST":
            postReqs++;
            break;
        case "PUT":
            putReqs++;
            break;
        case "DELETE":
            delReqs++;
            break;
        default:
            // ya mum 🖕🏻
            break;
    }
    totalReqs++;
    const start = performance.now();
    res.on("finish", () => {
        overallLatency = performance.now() - start;
    });
    next();
};

let activeUserCount = 0;
const activeUsers = async (req, res, next) => {
    if (req.path === "/api/auth" && req.method === "DELETE") {
        activeUserCount--;
    } else if (req.path === "/api/auth" && req.method === "PUT") {
        activeUserCount++;
    }
    next();
};

let successfulAuthCount = 0;
let failedAuthCount = 0;
const authAttempts = async (req, res, next) => {
    res.on("finish", () => {
        if (~~(res.statusCode / 100) === 2) {
            successfulAuthCount++;
        } else {
            failedAuthCount++;
        }
    });
    next();
};

let soldPizzas = 0;
let revenue = 0;
let latency = 0;
let pizzaFailure = 0;
const pizzaCounter = async (req, res, next) => {
    if (req.method === "POST") {
        soldPizzas += req.body.items.length;
        revenue += req.body.items.reduce((acc, curr) => {
            return acc + curr.price;
        }, 0);
        const start = performance.now();
        res.on("finish", () => {
            const end = performance.now();
            latency = end - start;
            if (~~(res.statusCode / 100) !== 2) {
                pizzaFailure++;
            }
        });
    }
    next();
};

function sendMetricToGrafana(metricName, metricValue, type, unit) {
    const metric = {
        resourceMetrics: [
            {
                scopeMetrics: [
                    {
                        metrics: [
                            {
                                name: metricName,
                                unit: unit,
                                [type]: {
                                    dataPoints: [
                                        {
                                            asDouble: metricValue,
                                            timeUnixNano: Date.now() * 1000000,
                                            attributes: [
                                                {
                                                    key: "source",
                                                    value: { stringValue: metrics.source },
                                                },
                                            ],
                                        },
                                    ],
                                },
                            },
                        ],
                    },
                ],
            },
        ],
    };

    if (type === "sum") {
        metric.resourceMetrics[0].scopeMetrics[0].metrics[0][
            type
            ].aggregationTemporality = "AGGREGATION_TEMPORALITY_CUMULATIVE";
        metric.resourceMetrics[0].scopeMetrics[0].metrics[0][type].isMonotonic =
            true;
    }

    const body = JSON.stringify(metric);
    fetch(`${metrics.url}`, {
        method: "POST",
        body: body,
        headers: {
            Authorization: `Bearer ${metrics.apiKey}`,
            "Content-Type": "application/json",
        },
    })
        .then((response) => {
            if (!response.ok) {
                response.text().then((text) => {
                    console.error(
                        `Failed to push metrics data to Grafana: ${text}\n${body}`,
                    );
                });
            }
        })
        .catch((error) => {
            console.error("Error pushing metrics:", error);
        });
}

function getCpuUsagePercentage() {
    const cpuUsage = os.loadavg()[0] / os.cpus().length;
    return cpuUsage.toFixed(2) * 100;
}

function getMemoryUsagePercentage() {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsage = usedMemory / totalMemory;
    return memoryUsage.toFixed(2) * 100;
}

function sendMetricsPeriodically(period) {
    setInterval(() => {
        try {
            sendMetricToGrafana("postRequests", postReqs, "sum", "1");
            sendMetricToGrafana("putRequests", putReqs, "sum", "1");
            sendMetricToGrafana("getRequests", getReqs, "sum", "1");
            sendMetricToGrafana("delRequests", delReqs, "sum", "1");
            sendMetricToGrafana("requests", totalReqs, "sum", "1");

            sendMetricToGrafana("activeUsers", activeUserCount, "sum", "1");

            sendMetricToGrafana("authSuccess", successfulAuthCount, "sum", "1");
            sendMetricToGrafana("authFailure", failedAuthCount, "sum", "1");

            sendMetricToGrafana("soldPizzas", soldPizzas, "sum", "1");
            sendMetricToGrafana("revenue", revenue, "sum", "1");

            sendMetricToGrafana("pizzaFailures", pizzaFailure, "sum", "1");

            sendMetricToGrafana("latency", overallLatency, "sum", "ms");
            sendMetricToGrafana("pizzaLatency", latency, "sum", "ms");

            sendMetricToGrafana("cpu", getCpuUsagePercentage(), "gauge", "%");
            sendMetricToGrafana("memory", getMemoryUsagePercentage(), "gauge", "%");
        } catch (error) {
            console.log("Error sending metrics", error);
        }
    }, period);
}

module.exports = {
    requestTracker,
    activeUsers,
    authAttempts,
    pizzaCounter,
    sendMetricsPeriodically,
};