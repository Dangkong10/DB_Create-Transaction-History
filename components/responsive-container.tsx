import { View, useWindowDimensions, type ViewProps } from "react-native";
import { cn } from "@/lib/utils";

export interface ResponsiveContainerProps extends ViewProps {
  /**
   * Tailwind className for the container.
   */
  className?: string;
}

/**
 * A responsive container component.
 * - 모바일/태블릿 (≤1024px): max-width 제한 없이 화면 전체 사용
 * - PC (≥1025px): max-width 960px로 제한, 가운데 정렬
 */
export function ResponsiveContainer({
  children,
  className,
  style,
  ...props
}: ResponsiveContainerProps) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1025;

  return (
    <View
      className={cn("w-full mx-auto", className)}
      style={[
        { paddingHorizontal: 16 },
        isDesktop && { maxWidth: 960 },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}
