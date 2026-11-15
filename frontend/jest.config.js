module.exports = {
  preset: '@react-native/jest-preset',
  moduleNameMapper: {'^@/(.*)$':'<rootDir>/$1'},
  setupFilesAfterEnv:['<rootDir>/jest.setup.js'],
  testMatch:['**/__tests__/**/*.test.[jt]s?(x)'],
};
