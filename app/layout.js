import "./globals.css";

export const metadata = {
  title: "Fact Check Eval — 公告摘要事实一致性评测台",
  description: "把 AI 摘要拆成事实断言逐条核验，区分「写错」与「无据」，并把「没错但漏」单独统计。",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
