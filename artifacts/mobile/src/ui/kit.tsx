import { Children, Fragment, type ComponentProps, type ReactNode } from "react";
import {
  ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatMoney } from "@workspace/shared/money";
import { family, font, PRIMARY, radius, space, useColors, type Colors } from "./theme";

/**
 * UI-кит приложения (E2.1-T6): свои компоненты на StyleSheet и токенах темы (theme.ts), светлая и тёмная тема.
 * nativewind и Tamagui не взяли: лишняя сборочная прослойка над Metro в монорепо ради десятка компонентов.
 * Новые экраны собираются из этих компонентов; цвета и отступы — только из темы.
 */

export { family, PRIMARY, useColors };
export type IconName = ComponentProps<typeof Ionicons>["name"];

type Tone = "default" | "muted" | "danger" | "success" | "primary";
const toneColor = (colors: Colors, tone: Tone) =>
  tone === "muted" ? colors.muted : tone === "danger" ? colors.danger : tone === "success" ? colors.success : tone === "primary" ? colors.link : colors.foreground;

export function Icon({ name, size = 22, tone = "default", color }: { name: IconName; size?: number; tone?: Tone; color?: string }) {
  const colors = useColors();
  return <Ionicons name={name} size={size} color={color ?? toneColor(colors, tone)} />;
}

/** Экран по центру — вход, PIN, блокировка. */
export function Screen({ children }: { children: ReactNode }) {
  const colors = useColors();
  return <View style={[styles.screen, { backgroundColor: colors.background }]}>{children}</View>;
}

/**
 * Страница вкладки или стека: отступ под системную панель, крупный заголовок, прокрутка.
 * onRefresh — жест «потянуть вниз» (обычно запускает синхронизацию).
 */
export function Page({ title, children, onRefresh, refreshing = false, header = true, right }: {
  title?: string;
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** false — заголовок рисует стек (native header), отступ сверху не нужен. */
  header?: boolean;
  right?: ReactNode;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.page, { paddingTop: header ? insets.top + space.md : space.md }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PRIMARY} /> : undefined}
    >
      {header && title ? (
        <View style={styles.pageHeader}>
          <Title>{title}</Title>
          {right}
        </View>
      ) : null}
      {children}
    </ScrollView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={[font.title, { color: useColors().foreground }]}>{children}</Text>;
}

export function Label({ children, variant = "body", tone = "default", numberOfLines, testID }: {
  children: ReactNode;
  variant?: "heading" | "body" | "caption";
  tone?: Tone;
  numberOfLines?: number;
  testID?: string;
}) {
  const colors = useColors();
  return <Text style={[font[variant], { color: toneColor(colors, tone) }]} numberOfLines={numberOfLines} testID={testID}>{children}</Text>;
}

export function Hint({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "danger" }) {
  const colors = useColors();
  return <Text style={[styles.hint, { color: tone === "danger" ? colors.danger : colors.muted }]}>{children}</Text>;
}

export function Field(props: TextInputProps & { label: string }) {
  const colors = useColors();
  const { label, style, ...input } = props;
  return (
    <View style={styles.field}>
      <Text style={[font.caption, { color: colors.muted }]}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }, style]}
        {...input}
      />
    </View>
  );
}

export function Button({ title, onPress, disabled, busy, variant = "primary", icon, testID }: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: "primary" | "secondary" | "danger" | "link";
  icon?: IconName;
  testID?: string;
}) {
  const colors = useColors();
  const inactive = disabled || busy;
  if (variant === "link") {
    return (
      <Pressable onPress={onPress} disabled={inactive} hitSlop={12} testID={testID} accessibilityRole="button">
        <Text style={[styles.link, { color: inactive ? colors.muted : colors.link }]}>{title}</Text>
      </Pressable>
    );
  }
  const filled = variant === "primary";
  const textColor = filled ? "#fff" : variant === "danger" ? colors.danger : colors.foreground;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      testID={testID}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        filled ? { backgroundColor: PRIMARY } : { backgroundColor: colors.card, borderWidth: 1, borderColor: variant === "danger" ? colors.danger : colors.border },
        { opacity: inactive ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <View style={styles.row}>
          {icon && <Ionicons name={icon} size={18} color={textColor} />}
          <Text style={[styles.buttonText, { color: textColor }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Card({ children, onPress, testID }: { children: ReactNode; onPress?: () => void; testID?: string }) {
  const colors = useColors();
  const style = [styles.card, { backgroundColor: colors.card, borderColor: colors.border }];
  if (!onPress) return <View style={style} testID={testID}>{children}</View>;
  return (
    <Pressable onPress={onPress} testID={testID} style={({ pressed }) => [style, { opacity: pressed ? 0.85 : 1 }]}>
      {children}
    </Pressable>
  );
}

/** Группа строк в карточке с разделителями и необязательным заголовком. */
export function Section({ title, children }: { title?: string; children: ReactNode }) {
  const colors = useColors();
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.section}>
      {title && <Text style={[styles.sectionTitle, { color: colors.muted }]}>{title.toUpperCase()}</Text>}
      <View style={[styles.sectionBody, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {items.map((item, index) => (
          <Fragment key={index}>
            {index > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
            {item}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

export function ListItem({ icon, iconColor, title, subtitle, value, right, onPress, disabled, chevron, testID }: {
  icon?: IconName;
  iconColor?: string;
  title: string;
  subtitle?: string | null;
  value?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  /** Стрелка «перейти»; по умолчанию — если строка нажимается. */
  chevron?: boolean;
  testID?: string;
}) {
  const colors = useColors();
  const content = (
    <View style={[styles.listItem, { opacity: disabled ? 0.5 : 1 }]}>
      {icon && (
        <View style={[styles.listIcon, { backgroundColor: colors.subtle }]}>
          <Ionicons name={icon} size={18} color={iconColor ?? PRIMARY} />
        </View>
      )}
      <View style={styles.listText}>
        <Text style={[font.body, { color: colors.foreground }]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={[font.caption, { color: colors.muted }]} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {typeof value === "string" ? <Text style={[font.body, { color: colors.foreground }]}>{value}</Text> : value}
      {right}
      {(chevron ?? Boolean(onPress)) && !disabled && <Ionicons name="chevron-forward" size={18} color={colors.muted} />}
    </View>
  );
  if (!onPress || disabled) return <View testID={testID}>{content}</View>;
  return (
    <Pressable onPress={onPress} testID={testID} style={({ pressed }) => ({ backgroundColor: pressed ? colors.subtle : "transparent" })}>
      {content}
    </Pressable>
  );
}

/** Сумма: доходы зелёные, расходы — обычным цветом (как на сайте); signed — со знаком «+». */
export function Money({ amount, currency = "RUB", signed = false, size = "body", testID }: {
  amount: string | null | undefined;
  currency?: string;
  signed?: boolean;
  size?: "title" | "heading" | "body" | "caption";
  testID?: string;
}) {
  const colors = useColors();
  const positive = Boolean(amount) && !String(amount).startsWith("-") && Number(amount) !== 0;
  return (
    <Text style={[font[size], styles.money, { color: signed && positive ? colors.income : colors.expense }]} testID={testID}>
      {formatMoney(amount, currency, { signed })}
    </Text>
  );
}

export function Badge({ text, tone = "muted" }: { text: string; tone?: Tone }) {
  const colors = useColors();
  const color = toneColor(colors, tone);
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[font.caption, { color }]}>{text}</Text>
    </View>
  );
}

export function Chip({ label, selected, onPress, testID }: { label: string; selected?: boolean; onPress: () => void; testID?: string }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      style={[styles.chip, selected ? { backgroundColor: PRIMARY, borderColor: PRIMARY } : { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <Text style={[font.caption, { color: selected ? "#fff" : colors.foreground }]}>{label}</Text>
    </Pressable>
  );
}

export function EmptyState({ icon = "file-tray-outline", title, text, action }: { icon?: IconName; title: string; text?: string; action?: ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={40} color={colors.muted} />
      <Text style={[font.heading, { color: colors.foreground, textAlign: "center" }]}>{title}</Text>
      {text && <Text style={[styles.hint, { color: colors.muted, textAlign: "center" }]}>{text}</Text>}
      {action}
    </View>
  );
}

/**
 * Полоса прогресса: value — доля 0…1 (больше 1 — перерасход, полоса во всю ширину), marker — отметка «ожидалось к сегодня».
 * tone: ok — основной цвет, warning — оранжевый, over — красный.
 */
export function Progress({ value, marker, tone = "ok", testID }: { value: number; marker?: number; tone?: "ok" | "warning" | "over"; testID?: string }) {
  const colors = useColors();
  const color = tone === "over" ? colors.danger : tone === "warning" ? colors.warning : PRIMARY;
  const width = `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` as const;
  return (
    <View style={[styles.track, { backgroundColor: colors.subtle }]} testID={testID}>
      <View style={[styles.fill, { width, backgroundColor: color }]} />
      {marker !== undefined && marker > 0 && marker < 1 && (
        <View style={[styles.marker, { left: `${Math.round(marker * 100)}%`, backgroundColor: colors.foreground }]} />
      )}
    </View>
  );
}

/** Нижний лист вместо диалога: выбор, подтверждение. */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Закрыть" />
      <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + space.lg }]}>
        <View style={[styles.grabber, { backgroundColor: colors.border }]} />
        {title && <Text style={[font.heading, { color: colors.foreground }]}>{title}</Text>}
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: space.xl, justifyContent: "center", gap: space.lg },
  page: { paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.lg },
  pageHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  hint: { fontSize: 14, lineHeight: 20 },
  field: { gap: 6 },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: space.md, fontSize: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  button: { alignSelf: "stretch", borderRadius: radius.md, paddingVertical: 14, alignItems: "center", minHeight: 48, justifyContent: "center" },
  buttonText: { fontSize: 16, fontFamily: family.semibold },
  link: { fontSize: 15, textAlign: "center", paddingVertical: space.sm },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  section: { gap: 6 },
  sectionTitle: { fontSize: 12, fontFamily: family.semibold, letterSpacing: 0.5, paddingHorizontal: space.xs },
  sectionBody: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, overflow: "hidden" },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: space.lg },
  listItem: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 52 },
  listIcon: { width: 32, height: 32, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  listText: { flex: 1, gap: 2 },
  money: { fontVariant: ["tabular-nums"] },
  badge: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2 },
  chip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6 },
  empty: { alignItems: "center", gap: space.sm, paddingVertical: space.xl * 2, paddingHorizontal: space.lg },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.lg, gap: space.md },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2 },
  track: { height: 8, borderRadius: 4, overflow: "hidden", position: "relative" },
  fill: { height: 8, borderRadius: 4 },
  marker: { position: "absolute", top: 0, width: 2, height: 8, opacity: 0.6 },
});
