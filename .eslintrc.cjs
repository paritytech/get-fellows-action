const {
  getConfiguration,
  getTypescriptOverride,
} = require("@eng-automation/js-style/src/eslint/configuration");

const tsConfParams = { rootDir: __dirname };

const conf = getConfiguration({ typescript: tsConfParams });

const tsConfOverride = getTypescriptOverride(tsConfParams);
tsConfOverride.rules["@typescript-eslint/strict-boolean-expressions"] = 0
tsConfOverride.rules["@typescript-eslint/no-unsafe-call"] = 0
conf.overrides.push(tsConfOverride);

module.exports = conf;
