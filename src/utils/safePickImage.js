import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

export async function safePickImage() {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permiso requerido', 'Necesitas permitir acceso a tus fotos.');
    return null;
  }

  const hasNewApi = !!ImagePicker.MediaType;
  const options = {
    allowsEditing: true,
    quality: 0.7,
    ...(hasNewApi
      ? { mediaTypes: ImagePicker.MediaType.Image }
      : { mediaTypes: ImagePicker.MediaTypeOptions.Images }
    ),
  };

  const result = await ImagePicker.launchImageLibraryAsync(options);
  if (result?.canceled) return null;
  return result?.assets?.[0]?.uri ?? null;
}
