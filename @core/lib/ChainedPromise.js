class ChainedPromise extends Promise {
  constructor(executor = (resolve) => resolve()) {
    let resolver, rejecter;
    super((resolve, reject) => {
      resolver = resolve;
      rejecter = reject;
      if (typeof executor === "function") {
        executor(resolve, reject);
      }
    });

    this._resolve = resolver;
    this._reject = rejecter;
  }

  chain(executor) {
    return new this.constructor((resolve, reject) => {
      this.then((value) => {
        try {
          resolve(executor(value));
        } catch (err) {
          reject(err);
        }
      }).catch(reject);
    });
  }

  resolve(value) {
    this._resolve(value);
    return this;
  }

  reject(reason) {
    this._reject(reason);
    return this;
  }

  static resolve(value) {
    return new this((resolve) => resolve(value));
  }

  static reject(reason) {
    return new this((_, reject) => reject(reason));
  }
}

module.exports = ChainedPromise;
