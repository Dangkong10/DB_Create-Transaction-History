import { View, Text, TouchableOpacity } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/use-colors";

interface MonthlyCalendarProps {
  selectedDate: string; // YYYY-MM-DD format
  onDateSelect: (date: string) => void;
  onGoToToday: () => void;
}

export function MonthlyCalendar({
  selectedDate,
  onDateSelect,
  onGoToToday,
}: MonthlyCalendarProps) {
  const colors = useColors();
  const currentDate = new Date(selectedDate);
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // 월의 첫날과 마지막 날
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // 첫 주의 시작 요일 (0 = 일요일)
  const startDayOfWeek = firstDay.getDay();

  // 총 일수
  const daysInMonth = lastDay.getDate();

  const toLocalDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // 이전 달로 이동
  const goToPreviousMonth = () => {
    onDateSelect(toLocalDateStr(new Date(year, month - 1, 1)));
  };

  // 다음 달로 이동
  const goToNextMonth = () => {
    onDateSelect(toLocalDateStr(new Date(year, month + 1, 1)));
  };

  // 날짜 클릭 핸들러
  const handleDateClick = (day: number) => {
    onDateSelect(toLocalDateStr(new Date(year, month, day)));
  };

  // 달력 날짜 배열 생성
  const calendarDays: (number | null)[] = [];

  // 첫 주의 빈 칸 추가
  for (let i = 0; i < startDayOfWeek; i++) {
    calendarDays.push(null);
  }

  // 날짜 추가
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  // 오늘 날짜
  const today = new Date();
  const isToday = (day: number) => {
    return (
      year === today.getFullYear() &&
      month === today.getMonth() &&
      day === today.getDate()
    );
  };

  // 선택된 날짜
  const selectedDay = currentDate.getDate();

  return (
    <View className="bg-surface p-4 rounded-lg">
      {/* 월 네비게이션 */}
      <View className="flex-row items-center justify-between mb-4">
        <TouchableOpacity onPress={goToPreviousMonth} className="p-2">
          <MaterialIcons name="chevron-left" size={24} color={colors.primary} />
        </TouchableOpacity>

        <Text className="text-lg font-bold text-foreground">
          {year}년 {month + 1}월
        </Text>

        <TouchableOpacity onPress={goToNextMonth} className="p-2">
          <MaterialIcons name="chevron-right" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* 요일 헤더 */}
      <View className="flex-row mb-2">
        {["일", "월", "화", "수", "목", "금", "토"].map((day, index) => (
          <View key={index} className="flex-1 items-center">
            <Text
              className="text-sm font-semibold"
              style={{
                color:
                  index === 0
                    ? colors.error // 일요일 빨간색
                    : index === 6
                    ? colors.primary // 토요일 파란색
                    : colors.foreground,
              }}
            >
              {day}
            </Text>
          </View>
        ))}
      </View>

      {/* 날짜 그리드 */}
      <View className="flex-row flex-wrap">
        {calendarDays.map((day, index) => {
          if (day === null) {
            return <View key={`empty-${index}`} className="w-[14.28%] aspect-square" />;
          }

          const isSelected = day === selectedDay;
          const isTodayDate = isToday(day);

          return (
            <TouchableOpacity
              key={day}
              onPress={() => handleDateClick(day)}
              className="w-[14.28%] aspect-square items-center justify-center"
            >
              <View
                className={`w-10 h-10 items-center justify-center rounded-full ${
                  isSelected ? "bg-primary" : isTodayDate ? "bg-surface" : ""
                }`}
                style={{
                  borderWidth: isTodayDate && !isSelected ? 1 : 0,
                  borderColor: colors.primary,
                }}
              >
                <Text
                  className={`text-base ${
                    isSelected ? "text-white font-bold" : "text-foreground"
                  }`}
                  style={{
                    color: isSelected
                      ? "#ffffff"
                      : index % 7 === 0
                      ? colors.error // 일요일
                      : index % 7 === 6
                      ? colors.primary // 토요일
                      : colors.foreground,
                  }}
                >
                  {day}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 오늘(T) 버튼 */}
      <TouchableOpacity
        onPress={onGoToToday}
        className="mt-4 bg-background py-2 px-4 rounded-lg self-center"
        style={{
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Text className="text-center text-base text-foreground font-semibold">
          오늘(T)
        </Text>
      </TouchableOpacity>
    </View>
  );
}
