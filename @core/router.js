import express from "express";
import { readdirSync } from "fs";
import { join } from "path";
import { decorators } from "@bootloader/core";

import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

/**
 * Normalize a given path by removing duplicate slashes and trailing slashes.
 */
function normalizePath(path) {
  return path.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

function toArray(value) {
  return Array.isArray(value) ? value : [value];
}

// Middleware wrapper
function wrapMiddleware(middleware, status = 400, message="Bad request") {
  return async (req, res, next) => {
      try {
          const result = await middleware({ request: req, response: res, next : next });

          // If middleware explicitly returns `false` or an error object, stop and respond
          if (result === false) {
              return res.status(status).json({ error: message });
          } else if (result && typeof result === 'object') {
              return res.status(status).json(result);
          }

          // Otherwise, continue
          if (!res.headersSent) next();
      } catch (err) {
          next(err); // Pass error to Express error handler
      }
  };
}

/**
 * Load and configure an Express app with controllers and middlewares.
 *
 * @param {Object} options - Configuration options for loading the app.
 * @param {string} options.name - Application name (used for paths).
 * @param {string} options.context - Base context path for the app.
 * @param {Object} options.app - Express app instance.
 * @param {string} options.prefix - Optional prefix for routes.
 */
export function loadApp({ name = "app", context = "", app, prefix = "" }) {
  const router = express.Router();

  // Load middlewares from the "middlewares" directory
  const middlewaresPath = join(process.cwd(), `${name}/middlewares`);
  const middlewaresFiles = readdirSync(middlewaresPath).filter((file) => file.endsWith(".js"));

  const middlewaresMap = {};
  for (const file of middlewaresFiles) {
    const { default: middleware } = require(join(middlewaresPath, file));

    if (!middleware) continue;

    // Use the filename (without extension) as the middleware key
    let middlewareName = file.split(".").slice(0, -1).join(".");
    middlewaresMap[middlewareName] = typeof middleware === "function" ? { middleware } : middleware;
  }

  // Load controllers from the "controllers" directory
  const controllersPath = join(process.cwd(), `${name}/controllers`);
  const controllerFiles = readdirSync(controllersPath).filter((file) => file.endsWith(".js"));

  let swaggerPaths = {};

  for (const file of controllerFiles) {
    const { default: ControllerClass } = require(join(controllersPath, file));

    if (!ControllerClass) continue;

    // Get the last registered controller from the decorators system
    let controller = decorators.mappings.controller[decorators.mappings.controller.length - 1];

    if (!controller._routed) {
      controller._routed = true;
      let cTarget = new ControllerClass();

      // Iterate over controller mappings and set up routes
      for (const { path, method, handler, responseType, name, auth, middleware } of controller.maps) {
        let full_path = normalizePath(`/${prefix}/${controller.path}/${path}`);
        console.log(`@RequestMappings:${method}:/${full_path} ${auth ? "-" : "="}> ${name}`);

        let additionalMiddlewares = [...toArray(controller.middleware),...toArray(middleware)].map(function(mName){
          return wrapMiddleware(middlewaresMap?.[mName]?.middleware || (() => true ));
        }) || [];

        const authMiddleware = middlewaresMap.AuthRequired?.middleware;
        if (auth && typeof authMiddleware == 'function') {
          additionalMiddlewares = [wrapMiddleware(authMiddleware,401,"Unauthorized"),...additionalMiddlewares];
        }

        // Define route with optional authentication middleware
        router[method](
          `${full_path}`,
          ...additionalMiddlewares,
          async (req, res) => {
            try {
              // Define global constants for the app
              const CONST = {
                CDN_URL: "https://deployed.boot-web.pages.dev",
                CDN_DEBUG: false,
                APP_TITLE: "Test",
                APP: "www",
                APP_SITE: undefined,
                APP_CONTEXT: "/www",
                CDN_VERSION: "5",
                SESS: "req.session.user", // Placeholder session variable
              };

              const model = {};
              // Call the route handler with necessary context
              const result = await handler.call(cTarget, {
                request: req,
                response: res,
                model,
                CONST,
              });

              // Handle different response types (view rendering or JSON response)
              if (responseType === "view" || (!responseType && typeof result === "string")) {
                res.render(result, {
                  model,
                  CONST,
                  CONST_SCRIPT: "window.CONST=" + JSON.stringify(CONST),
                });
              } else if (responseType === "json" || !responseType) {
                res.json(result);
              }
            } catch (err) {
              console.error(err);
              res.status(500).json({ error: "Internal Server Error" });
            }
          }
        );

        // Generate Swagger docs for each route
        swaggerPaths[full_path] = {
          [method]: {
            summary: `Handler for ${name}`,
            description: `Auto-generated handler for ${name}`,
            tags: [controller.path],
            responses: {
              200: { description: "Success" },
              401: { description: "Unauthorized" },
              500: { description: "Internal Server Error" },
            },
          },
        };
      }
    }
  }

  // Middleware to set the views directory for rendering templates
  router.use((req, res, next) => {
    res.app.set("views", join(process.cwd(), `${name}/views`));
    next();
  });

  // Swagger setup
  const swaggerDefinition = {
    openapi: "3.0.0",
    info: {
      title: "BootStack API",
      version: "1.0.0",
      description: "Auto-generated API documentation using Swagger",
    },
    servers: [{ url: "http://localhost:3000" }],
    paths: swaggerPaths,
  };

  const swaggerSpec = swaggerJsdoc({ definition: swaggerDefinition, apis: [] });
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // Attach the router to the main app with the specified context
  app.use(context, router);
}
