import {Platform} from 'react-native';
export type LocalFile = {uri: string; name?: string; mimeType?: string};
export type UploadOptions = {files: Record<string, LocalFile>; fields?: Record<string, string>; method?: 'POST' | 'PUT'; headers?: Record<string, string>; signal?: AbortSignal};
export function fileNameFor(file: LocalFile): string {
  return file.name || file.uri.split('?')[0].split('/').pop() || 'file';
}
export async function uploadForm(url: string, opts: UploadOptions): Promise<Response> {
  const form = new FormData();
  for (const [key, value] of Object.entries(opts.fields ?? {})) form.append(key, value);
  for (const [key, file] of Object.entries(opts.files)) {
    if (Platform.OS === 'web') {
      const blob = await (await fetch(file.uri)).blob();
      form.append(key, file.mimeType ? new Blob([blob], {type: file.mimeType}) : blob, fileNameFor(file));
    } else {
      form.append(key, {uri: file.uri, name: fileNameFor(file), type: file.mimeType || 'application/octet-stream'} as unknown as Blob);
    }
  }
  const headers = Object.fromEntries(Object.entries(opts.headers ?? {}).filter(([key]) => key.toLowerCase() !== 'content-type'));
  return fetch(url, {method: opts.method ?? 'POST', body: form, headers, signal: opts.signal});
}
