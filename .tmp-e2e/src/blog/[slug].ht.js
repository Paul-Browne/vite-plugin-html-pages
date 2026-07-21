export function generateStaticParams() {
  return [{ slug: 'listed' }];
}

export default function ({ params }) {
  return `<html><body><p>slug:${params.slug}</p></body></html>`;
}
