import { toAppPath } from "@/lib/links";

/** Входящая ссылка → путь экрана: fintrack://…, https://fin-wall.ru/app/…, exp://… (Expo Go). */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    return toAppPath(path);
  } catch {
    return "/";
  }
}
