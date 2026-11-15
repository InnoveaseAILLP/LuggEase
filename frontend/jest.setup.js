jest.mock('react-native-config', () => ({APP_BACKEND_URL:'https://test.example', APP_ENV:'development'}));
jest.mock('react-native-keychain', () => ({getGenericPassword:jest.fn(), setGenericPassword:jest.fn(), resetGenericPassword:jest.fn(), ACCESSIBLE:{WHEN_UNLOCKED_THIS_DEVICE_ONLY:'test'}}));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
