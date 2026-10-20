import { expect, test } from "vitest";

// 受け入れテスト用：CIが不合格のPull Requestをマージできないことを確かめる（マージしない）
test("わざと失敗させる", () => {
  expect(1 + 1).toBe(3);
});
