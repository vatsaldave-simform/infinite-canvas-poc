import { DocumentLoader, type DocumentLoaderProps } from '@react/DocumentLoader'

export default function App({ loading }: DocumentLoaderProps) {
  return <DocumentLoader loading={loading} />
}
