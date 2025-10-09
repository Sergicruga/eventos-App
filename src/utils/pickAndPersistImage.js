// src/utils/pickAndPersistImage.js
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy'; // 👈 usa API legacy estable

export async function pickAndPersistImage() {
  // 👉 SDK 54: usa ImagePicker.MediaType (o array)
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaType.Images,
    allowsEditing: true,
    quality: 0.8,
  });

  if (result.canceled) return null;

  const asset = result.assets?.[0];
  if (!asset?.uri) return null;

  const dir = FileSystem.documentDirectory + 'event-images/';
  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch (_) {}

  const ext = (asset.uri.split('.').pop() || 'jpg').toLowerCase();
  const filename = `${Date.now()}.${ext}`;
  const dest = dir + filename;

  await FileSystem.copyAsync({ from: asset.uri, to: dest });
  return dest; // file://...
}
