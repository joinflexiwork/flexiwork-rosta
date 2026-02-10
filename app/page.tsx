export default function Home() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(to bottom right, violet, blue)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
      }}
    >
      <h1>FlexiWork Rosta</h1>
      <a href="/login" style={{ color: "white", marginTop: "20px" }}>
        Go to login
      </a>
    </div>
  );
}
