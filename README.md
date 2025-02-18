# BootNode

BootNode is a lightweight, Spring Boot-inspired Node.js framework that simplifies backend development with decorators, modular routing, and built-in support for dependency injection. It is designed to provide an intuitive structure for building scalable web applications using Express and Babel.

## Features

- **Spring Boot-style Routing**: Use decorators like `@RequestMapping`, `@ResponseBody`, and `@ResponseView` to define routes efficiently.
- **Class-based Controllers**: Organize your endpoints with controller classes similar to Spring Boot.
- **Dependency Injection**: Easily inject services and middleware into controllers.
- **EJS Template Rendering**: Built-in support for EJS views with automatic data binding.
- **Database-Driven Scripting**: Execute scripts dynamically from a database while maintaining Babel decorator support.
- **Built-in Middleware**: Provides session management, authentication, and request validation out of the box.
- **Custom Decorators**: Extend functionality with your own method and class decorators.
- **Scalable Project Structure**: Inspired by enterprise-level backend frameworks.

## Installation

```sh
npm install
```

## Running the Server

### Development Mode
```sh
npm run dev
```
This runs the server with Babel for ES module support and live reload.

### Production Mode
```sh
npm run build
npm start
```
This compiles the source code and runs the optimized server.

## Project Structure
```
boot-node/
├── app/
│   ├── controllers/    # Route handlers (decorator-based)
│   ├── services/       # Business logic services
│   ├── middlewares/    # Express middlewares
│   ├── views/          # EJS templates
│   └── models/         # Database models
├── lib/
│   ├── router.js       # Custom Express router with decorators
│   ├── decorators.js   # BootNode decorator implementations
│   └── utils.js        # Utility functions
├── dist/               # Compiled output (production build)
├── babel.config.js     # Babel configuration
├── package.json        # Dependencies and scripts
└── server.js           # Application entry point
```

## Usage

### Defining a Controller
Create a new controller inside `app/controllers/`.

```javascript
import { Controller, RequestMapping, ResponseBody } from "../../lib/decorators.js";

@Controller("/users")
class UserController {
  @RequestMapping("/", "get")
  @ResponseBody
  getUsers({ request }) {
    return [{ id: 1, name: "John Doe" }];
  }
}
```

### Rendering Views
```javascript
import { Controller, RequestMapping, ResponseView } from "../../lib/decorators.js";

@Controller("/dashboard")
class DashboardController {
  @RequestMapping("/", "get")
  @ResponseView
  renderDashboard({ model }) {
    model.title = "Dashboard";
    return "dashboard"; // Renders views/dashboard.ejs
  }
}
```

### Middleware Support
Middleware functions can be used globally or within controllers.

```javascript
import { Middleware } from "../../lib/decorators.js";

@Middleware((req, res, next) => {
  console.log("Request received:", req.path);
  next();
})
@Controller("/api")
class ApiController {
  @RequestMapping("/ping", "get")
  @ResponseBody
  ping() {
    return { message: "pong" };
  }
}
```

## Customizing BootNode
BootNode allows custom decorators for advanced use cases. You can extend the decorator system in `lib/decorators.js` to add new functionality.

## Contributing
Feel free to open an issue or submit a pull request at [GitHub Repository](https://github.com/bootloader/boot-node).

## License
MIT License.

