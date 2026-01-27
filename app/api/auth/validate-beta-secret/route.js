import { NextResponse } from 'next/server'

export async function POST(request) {
    try {
        const body = await request.json()
        const { secret } = body
        const PRIVATE_BETA_SECRET = process.env.PRIVATE_BETA_SECRET || 'trypzy-beta-2024'

        return NextResponse.json({
            valid: secret === PRIVATE_BETA_SECRET
        })
    } catch (error) {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
}
