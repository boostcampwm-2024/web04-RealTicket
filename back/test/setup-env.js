require('../src/config/loadDotEnv');

const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (id) {
  const module = originalRequire.apply(this, arguments);

  if (id === 'typeorm' && module.DeleteDateColumn) {
    const originalDeleteDateColumn = module.DeleteDateColumn;
    module.DeleteDateColumn = function (options) {
      if (options && options.type === 'timestamp') {
        options = { ...options, type: 'datetime' };
      }
      return originalDeleteDateColumn(options);
    };

    const originalColumn = module.Column;
    module.Column = function (options) {
      if (options && options.type === 'timestamp') {
        options = { ...options, type: 'datetime' };
      }
      return originalColumn(options);
    };
  }

  return module;
};
