/**
 * Disable Pressable className support in NativeWind
 * 
 * NativeWind's Pressable className has known issues with state management.
 * This file disables it globally to prevent render loops and stale state.
 * 
 * Use style prop instead:
 * <Pressable style={({ pressed }) => [styles.button, pressed && styles.pressed]} />
 */

import { Platform } from "react-native";

if (Platform.OS !== "web") {
  // Disable Pressable className in NativeWind
  // This prevents issues with pressed states and re-renders
  try {
    const { cssInterop } = require("nativewind");
    const { Pressable } = require("react-native");
    
    cssInterop(Pressable, {
      className: false,
    });
  } catch (error) {
    // Silently fail if nativewind is not available
    console.warn("Failed to configure NativeWind Pressable:", error);
  }
}
