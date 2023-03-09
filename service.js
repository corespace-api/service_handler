const ServiceManager = require('./assets/utils/serviceManager');

class ServiceHandler extends ServiceManager {
  constructor(name) {
    super(name);
    this.fingerprintMiddleware = null;
    this.cors = null;
  }

  gracefulShutdown() {
    this.logger.log("Gracefully shutting down the service...");
    this.serviceSchema.findOne({ uuid: this.config.getConfig("uuid") }).then((service) => {
      if (!service) {
        this.logger.warn("Service not found in database");
        process.exit(1);
      }

      service.status = "await_removal";
      service.command = "user_init_shutdown"
      service.save().then(() => {
        this.logger.success("Service status updated to 'await_removal'");
        process.exit(0);
      }).catch((error) => {
        this.logger.error(error);
        process.exit(1);
      });
    }).catch((error) => {
      this.logger.error(error);
      process.exit(1);
    });
  }

  loadDependencies() {
    super.loadDependencies();
  }

  loadCustomDependencies() {
    super.loadCustomDependencies();
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

  renoveServiceFromDatabase() {
    this.serviceSchema.find({ status: "await_removal" }).then((services) => {
      if (services.length > 0) {
        services.forEach((service) => {
          this.logger.info(`Removing service ${service.uuid} from database`);
          service.remove().then(() => {
            this.logger.success(`Service ${service.uuid} removed from database`);
          }).catch((error) => {
            this.logger.error(error);
          });
        });
      }
    }).catch((error) => {
      this.logger.error(error);
    });
  }

  checkForServiceRemoval() {
    this.logger.log("Checking for services that are older than 1 minute...");
    // find all services that are older that 1 minute and then set the status to await_removal
    this.serviceSchema.find({
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
  }

  init() {
    // default behaviour
    this.loadDependencies();
    this.createLogger();
    this.loadCustomDependencies();
    this.loadConfig();

    // Create database connection
    this.dbConnection();
    this.registerService();

    this.config.setConfig("heartbeat", 10000)
    this.config.setConfig("listenInterval", 20000)
    this.heardBeat();
    this.listenCommands();
  }

  start() {
    this.logger.log("Starting Service...");

    setInterval(() => {
      this.checkForServiceRemoval();
      this.renoveServiceFromDatabase();
    }, this.config.getConfig("heartbeat"));
  }
}

const serviceHandler = new ServiceHandler("Service Handler");
serviceHandler.init();
serviceHandler.start();


// listen for process termination
process.on("SIGINT", () => {
  serviceHandler.gracefulShutdown();
});

process.on("SIGTERM", () => {
  serviceHandler.gracefulShutdown();
});