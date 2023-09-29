/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testTimeout: 20_000,
  testMatch: [__dirname + "/src/**/test/**/*.ts"],
};
