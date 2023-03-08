const dotenv = require("dotenv");
const crypto = require("crypto");
const path = require("path");

const Logger = require("./assets/utils/logger");
const ServiceManager = require("./assets/utils/serviceManager");
const DBConnector = require("./assets/database/DBManager");

const serviceSchema = require("./assets/models/service");

class Service {
  constructor(service) {
    this.service = service;
    this.logger = new Logger("Service/Manager");
    this.dbc = new DBConnector();
    this.timer = 10000;
    this.config = {};
  }

  loadConfig() {
    dotenv.config();

    // Load configuration
    this.config.allowDebug = process.env.ALLOW_DEBUG || false;
  }

  dbConnection() {
    // Starting connection to the database
    this.dbc.createAUrl();
    this.logger.log(`Starting connection to the database...`);
    this.logger.log(`Database URL: ${this.dbc.url}`);
    this.dbc
      .attemptConnection()
      .then(() => {
        this.logger.success("Database connection succeeded");
      })
      .catch((error) => {
        this.logger.log("Database connection failed");
        this.logger.error(error);
      });
  }

  setStatus(service, status) {
    service.status = status;
    service.save()
      .then(() => {
        this.logger.info(`Service ${service.uuid} is now awaiting removal`);
      })
      .catch((error) => {
        this.logger.error(error);
      });
  }

  checkForServiceRemoval() {
    setInterval(() => {
      this.logger.log("Checking for services that are older than 1 minute...");
      // find all services that are older that 1 minute and then set the status to await_removal
      serviceSchema.find({
          status: "active",
          lastSeen: { $lt: new Date(Date.now() - 60000) },
        }).then((services) => {
          if (services.length > 0) {
            services.forEach((service) => {
              this.logger.info(`Service ${service.uuid} is older than 1 minute`);
              this.setStatus(service, "await_removal");
            });
          }
        }).catch((error) => {
          this.logger.error(error);
        });
    }, this.timer);
  }

  manage() {
    this.serviceManager = new ServiceManager(this.service, 10000, true);
    this.serviceManager.registerService();
    this.serviceManager.listenForKillSignal();
    this.serviceManager.checkForServiceRemoval();
  }

  refreshStatus() {
    setInterval(() => {
      this.serviceManager.setServiceStatus("active").catch((error) => {
        this.logger.error(error);
      });
    }, this.timer);
  }

  gracefulShutdown() {
    this.logger.log("Gracefully shutting down the service...");
    this.dbc.closeConnection();
    this.serviceManager
      .unregisterService()
      .then(() => {
        this.logger.success("Service shutdown complete");
        process.exit(1);
      })
      .catch((error) => {
        this.logger.error(error);
        process.exit(1);
      });
  }
}

const service = new Service({
  type: "Manager",
  name: "Manager",
  uuid: crypto.randomBytes(16).toString("hex"),
  version: "1.0.0",
  description: "Service manager for the microservice architecture",
});

service.loadConfig();
service.dbConnection();
service.checkForServiceRemoval();

service.manage();
service.refreshStatus();

// listen for process termination
process.on("SIGINT", () => {
  service.gracefulShutdown();
});
