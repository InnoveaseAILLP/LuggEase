const mockPopup = jest.fn();
jest.mock('firebase/app', () => ({getApps: () => [], initializeApp: jest.fn(() => ({}))}));
jest.mock('firebase/auth', () => ({
  initializeAuth: jest.fn(() => ({currentUser: null})),
  browserSessionPersistence: {}, inMemoryPersistence: {}, browserPopupRedirectResolver: {},
  GoogleAuthProvider: jest.fn(), signInWithPopup: (...args: unknown[]) => mockPopup(...args),
}));
import {identity} from '../src/firebase.web';
beforeEach(() => mockPopup.mockReset());
test('opens Google popup synchronously from the user action', async () => {
  mockPopup.mockResolvedValue({});
  const pending = identity.google();
  expect(mockPopup).toHaveBeenCalledWith({currentUser: null}, expect.anything());
  await pending;
});
test.each([
  ['auth/popup-blocked', 'Allow pop-ups'],
  ['auth/unauthorized-domain', 'temporarily unavailable'],
  ['auth/popup-closed-by-user', 'cancelled'],
])('explains %s to the user', async (code, message) => {
  mockPopup.mockRejectedValue({code});
  await expect(identity.google()).rejects.toThrow(message);
});
test('turns network failures into connection guidance', async () => {
  const failure = new Error('Network unavailable');
  mockPopup.mockRejectedValue(failure);
  await expect(identity.google()).rejects.toThrow('Check your internet connection');
});
