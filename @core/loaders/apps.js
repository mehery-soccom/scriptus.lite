import { join } from "path";

const apps = {
  _initialized: false,
  _initializingPromise: null,

  _options: null,
  _appPaths: null,

  load({ name, path, context, include }) {
    if (this._initialized) return;

    //const appName = name;
    const appPaths = ["app"];
    const appNames = [...include, name];
    for (let appName of appNames) {
      let appPath = ["default", "app"].indexOf(appName) >= 0 ? "app" : `app-${appName}`;
      if (appPaths.indexOf(appPath) < 0) {
        appPaths.push(appPath);
      }
    }
    this.setOptions({ name, path, context });
    this.setPaths(appPaths);
    this._initialized = true;
  },

  async loadAsync(options) {
    if (this._initialized) return;

    if (!this._initializingPromise) {
      this._initializingPromise = (async () => {
        this.setOptions(options);

        this._initialized = true;
      })();
    }

    await this._initializingPromise;
  },

  getOptions() {
    return this._options;
  },

  setOptions(newValue) {
    this._options = newValue;
  },

  getPaths() {
    return this._appPaths;
  },

  setPaths(newValue) {
    this._appPaths = newValue;
  },
};

module.exports = apps;
