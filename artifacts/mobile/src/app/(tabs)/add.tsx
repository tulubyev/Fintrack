import { Redirect } from "expo-router";

/** Место вкладки «＋»: нажатие перехватывает _layout и открывает /quick-add; сюда попадают только по ссылке. */
export default function AddTab() {
  return <Redirect href="/quick-add" />;
}
