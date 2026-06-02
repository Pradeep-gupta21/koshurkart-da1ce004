/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You've been invited to join {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>KOSHUR KART</Text>
        <Heading style={h1}>You've been invited</Heading>
        <Text style={text}>
          You've been invited to join{' '}
          <Link href={siteUrl} style={link}>
            <strong>{siteName}</strong>
          </Link>
          . Click the button below to accept the invitation and create your
          account.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Accept Invitation
        </Button>
        <Text style={footer}>
          If you weren't expecting this invitation, you can safely ignore this
          email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif", color: '#0F172A', padding: '32px 0' }
const container = { maxWidth: '560px', margin: '0 auto', padding: '32px', backgroundColor: '#ffffff', border: '1px solid #E2E8F0', borderRadius: '12px' }
const h1 = { fontSize: '24px', fontWeight: '700' as const, color: '#0F172A', margin: '0 0 16px', letterSpacing: '-0.01em' }
const text = { fontSize: '15px', color: '#475569', lineHeight: '1.6', margin: '0 0 20px' }
const link = { color: '#0F172A', textDecoration: 'underline', fontWeight: '600' as const }
const button = { backgroundColor: '#0F172A', color: '#F8FAFC', fontSize: '15px', fontWeight: '600' as const, borderRadius: '10px', padding: '14px 28px', textDecoration: 'none', display: 'inline-block' }
const footer = { fontSize: '13px', color: '#94A3B8', margin: '32px 0 0', paddingTop: '20px', borderTop: '1px solid #E2E8F0' }
const brand = { fontSize: '18px', fontWeight: '700' as const, color: '#F59E0B', letterSpacing: '0.02em', margin: '0 0 24px', textTransform: 'uppercase' as const }
