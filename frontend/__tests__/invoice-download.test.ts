import {Platform} from 'react-native';
import {fs, media, open} from 'react-native-blob-util';
import {apiPdf} from '../src/api';
import {downloadInvoice} from '../src/invoice-download';
jest.mock('../src/api', () => ({apiPdf:jest.fn()}));
jest.mock('react-native-blob-util', () => ({
  fs:{dirs:{CacheDir:'/cache'},writeFile:jest.fn().mockResolvedValue(1),unlink:jest.fn().mockResolvedValue(undefined),ls:jest.fn().mockResolvedValue([])},
  media:{copyToMediaStore:jest.fn().mockResolvedValue('content://download/1')},
  open:{optionsMenu:jest.fn().mockResolvedValue(undefined),file:jest.fn().mockResolvedValue(undefined)},
}));
const originalReader=global.FileReader;
const originalOS=Platform.OS, originalVersion=Platform.Version;
beforeEach(() => {
  jest.clearAllMocks();
  global.FileReader=class {
    result='data:application/pdf;base64,JVBERi0='; onload: () => void = () => {};
    readAsDataURL() { this.onload(); }
  } as any;
  (apiPdf as jest.Mock).mockResolvedValue(new Blob(['%PDF-1.7']));
});
afterEach(() => {global.FileReader=originalReader; Object.defineProperty(Platform,'OS',{value:originalOS,configurable:true}); Object.defineProperty(Platform,'Version',{value:originalVersion,configurable:true});});
test('Android 10+ saves a private authenticated PDF to Downloads and cleans temporary file', async () => {
  Object.defineProperty(Platform,'OS',{value:'android',configurable:true});
  Object.defineProperty(Platform,'Version',{value:31,configurable:true});
  await expect(downloadInvoice('order1','LE/001')).resolves.toContain('Downloads');
  expect(apiPdf).toHaveBeenCalledWith('/orders/order1/invoice.pdf');
  expect(media.copyToMediaStore).toHaveBeenCalledWith(expect.objectContaining({mime:'application/pdf',parentFolder:'LuggEase',name:expect.stringMatching(/^LuggEase-Sales-Invoice-LE-001-/)}),'Download',expect.stringContaining('/cache/'));
  expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('/cache/'));
});
test('iOS opens the system document menu with Save to Files', async () => {
  Object.defineProperty(Platform,'OS',{value:'ios',configurable:true});
  await expect(downloadInvoice('order1','LE/001')).resolves.toContain('Save to Files');
  expect(open.optionsMenu).toHaveBeenCalledWith(expect.stringContaining('.pdf'));
  expect(media.copyToMediaStore).not.toHaveBeenCalled();
});
