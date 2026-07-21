export default function ({ params }) {
  return `<html><body><p>path:${params.path.join('|')}</p></body></html>`;
}
