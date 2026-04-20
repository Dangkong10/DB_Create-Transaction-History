import React, { createContext, useContext, useState, useCallback } from "react";
import { View, Text, Modal, Pressable, StyleSheet } from "react-native";
import { useColors } from "@/hooks/use-colors";

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

interface ConfirmContextType {
  showConfirm: (options: ConfirmOptions) => void;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm must be used within ConfirmProvider");
  }
  return context;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  const [visible, setVisible] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);

  const showConfirm = useCallback((opts: ConfirmOptions) => {
    setOptions(opts);
    setVisible(true);
  }, []);

  const handleConfirm = () => {
    options?.onConfirm();
    setVisible(false);
  };

  const handleCancel = () => {
    options?.onCancel?.();
    setVisible(false);
  };

  return (
    <ConfirmContext.Provider value={{ showConfirm }}>
      {children}
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={handleCancel}
      >
        <View style={styles.overlay}>
          <View style={[styles.modal, { backgroundColor: colors.surface }]}>
            {options?.title && (
              <Text style={[styles.title, { color: colors.foreground }]}>
                {options.title}
              </Text>
            )}
            <Text style={[styles.message, { color: colors.muted }]}>
              {options?.message}
            </Text>
            <View style={styles.buttonContainer}>
              <Pressable
                onPress={handleCancel}
                style={({ pressed }) => [
                  styles.button,
                  styles.cancelButton,
                  { backgroundColor: colors.border },
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={[styles.buttonText, { color: colors.foreground }]}>
                  {options?.cancelText || "취소"}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleConfirm}
                style={({ pressed }) => [
                  styles.button,
                  styles.confirmButton,
                  { backgroundColor: colors.error },
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={[styles.buttonText, { color: "#FFFFFF" }]}>
                  {options?.confirmText || "확인"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ConfirmContext.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
  },
  modal: {
    width: "85%",
    maxWidth: 400,
    borderRadius: 12,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
  },
  buttonContainer: {
    flexDirection: "row",
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelButton: {},
  confirmButton: {},
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
