/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your verification code</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>KOSHUR KART</Text>
        <Heading style={h1}>Confirm reauthentication</Heading>
        <Text style={text}>Use the code below to confirm your identity:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>
          This code will expire shortly. If you didn't request this, you can
          safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif", color: '#0F172A', padding: '32px 0' }
const container = { maxWidth: '560px', margin: '0 auto', padding: '32px', backgroundColor: '#ffffff', border: '1px solid #E2E8F0', borderRadius: '12px' }
const h1 = { fontSize: '24px', fontWeight: '700' as const, color: '#0F172A', margin: '0 0 16px', letterSpacing: '-0.01em' }
const text = { fontSize: '15px', color: '#475569', lineHeight: '1.6', margin: '0 0 20px' }
const codeStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#000000',
  margin: '0 0 30px',
}
const footer = { fontSize: '13px', color: '#94A3B8', margin: '32px 0 0', paddingTop: '20px', borderTop: '1px solid #E2E8F0' }
const brand = { fontSize: '18px', fontWeight: '700' as const, color: '#F59E0B', letterSpacing: '0.02em', margin: '0 0 24px', textTransform: 'uppercase' as const }
