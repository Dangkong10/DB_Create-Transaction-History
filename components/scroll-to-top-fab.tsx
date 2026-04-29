import { TouchableOpacity, View, Platform } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

interface ScrollToTopFabProps {
  visible: boolean;
  onPress: () => void;
}

export function ScrollToTopFab({ visible, onPress }: ScrollToTopFabProps) {
  if (!visible) return null;

  const handlePress = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress();
  };

  const shadow = Platform.OS === "web"
    ? ({ boxShadow: "0 4px 16px rgba(0,0,0,0.18)" } as any)
    : {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
        elevation: 6,
      };

  return (
    <View
      style={{
        position: "absolute",
        right: 16,
        bottom: 24,
        zIndex: 50,
        pointerEvents: "box-none",
      }}
    >
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.8}
        accessibilityLabel="맨 위로 이동"
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: "#1B365D",
          justifyContent: "center",
          alignItems: "center",
          ...shadow,
        }}
      >
        <MaterialIcons name="keyboard-arrow-up" size={28} color="#ffffff" />
      </TouchableOpacity>
    </View>
  );
}
