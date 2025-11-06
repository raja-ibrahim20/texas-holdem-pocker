import { NextResponse } from 'next/server';
import type { HandHistoryEntry } from '@/lib/poker/types';

// --- API Route Handler ---

// New interface reflecting the structure returned by the Python/FastAPI persistence layer
export interface HandRecord {
  id: string;
  payload: HandHistoryEntry; // The original input data is nested here
  payoffs: Record<string, number>; // Maps player ID to payoff amount
  created_at: string;
}

// --- API Route Handler ---

/**
 * API route to retrieve poker hand history.
 * * NOTE: The Python API returns HandRecord objects, but this GET function converts them 
 * back to HandHistoryEntry[] (by extracting the nested 'payload') for client consistency.
 */
export async function GET(request: Request) {
  try {
    // 1. Extract the hand ID from the request URL (it may be null)
    const { searchParams } = new URL(request.url);
    const handId = searchParams.get('id');

    // 2. Define the Python API endpoint base
    const pythonApiUrlBase = process.env.PYTHON_API_URL || "http://127.0.0.1:8000/hands"
    // const pythonApiUrlBase = "http://python_backend:8000/hands"//process.env.PYTHON_API_URL || "http://127.0.0.1:8000/hands";

    let pythonTargetUrl: string;

    if (handId) {
      // If ID is provided, fetch a specific hand using the path parameter
      pythonTargetUrl = `${pythonApiUrlBase}/${handId}`;
    } else {
      // If no ID is provided, fetch all hands using the base URL
      pythonTargetUrl = pythonApiUrlBase;
    }

    // 3. Forward the GET request to the Python (FastAPI) service
    const pythonResponse = await fetch(pythonTargetUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      // No body needed for a GET request
    });

    // 4. Handle the response from the Python service
    if (!pythonResponse.ok) {
      const errorBody = await pythonResponse.json();
      const detailMessage = handId
        ? `Hand ID ${handId} not found or error occurred.`
        : `Error occurred while fetching all hands.`;

      console.error(`Error from Python GET API at ${pythonTargetUrl}:`, errorBody);
      return NextResponse.json(
        { detail: errorBody.detail || detailMessage },
        { status: pythonResponse.status }
      );
    }

    // 5. Process the response data, which is an array of HandRecord objects
    const data: HandRecord | HandRecord[] = await pythonResponse.json();
    let records: HandRecord[];

    if (handId) {
      // If a specific ID was requested, the Python API returns a single HandRecord object.
      records = [data as HandRecord];
    } else {
      // If all hands were requested, the Python API should return an array of HandRecord.
      records = data as HandRecord[];
    }

    // 6. Map the HandRecord array to HandHistoryEntry array (extracting 'payload')
    const responseData: HandHistoryEntry[] = records.map(record => record.payload);
    console.log(responseData);
    return NextResponse.json(responseData, { status: 200 });

  } catch (error: any) {
    // Handle network errors or issues
    console.error("Internal server error in Next.js GET API route:", error);
    return NextResponse.json([], { status: 200 });

    // return NextResponse.json(
    //   { detail: error.message || 'Internal server error' },
    //   { status: 500 }
    // );
  }
}


/**
 * API route to validate a poker hand history.
 * It receives the hand payload from the client, forwards it to the
 * Python/FastAPI validation service, and returns the result.
 */
export async function POST(request: Request) {
  try {
    // 1. Parse the incoming JSON payload from the client
    const hand: HandHistoryEntry = await request.json();

    // 2. Define the Python API endpoint
    // (Using an environment variable is best practice)
    const pythonApiUrl = process.env.PYTHON_API_URL || "http://127.0.0.1:8000/hands"//|| "http://127.0.0.1:8000/hands";"http://python_backend:8000/hands" 

    // 3. Forward the request to the Python (FastAPI) service
    const pythonResponse = await fetch(pythonApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(hand), // Send the same payload
    });

    // 4. Handle the response from the Python service
    if (!pythonResponse.ok) {
      // If the Python service returned an error (e.g., 400, 500)
      // Pass that error back to the client
      const errorBody = await pythonResponse.json();
      console.error("Error from Python API:", errorBody);
      return NextResponse.json(
        { detail: errorBody.detail || 'An error occurred with the Python service' },
        { status: pythonResponse.status }
      );
    }

    // 5. Send the successful response from Python back to the client
    const data = await pythonResponse.json();
    return NextResponse.json(data, { status: 200 });

  } catch (error: any) {
    // Handle network errors or issues with request.json()
    console.error("Internal server error in Next.js API route:", error);
    return NextResponse.json(
      { detail: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
// export async function POST(request: Request) {
//   try {
//     const hand: HandHistoryEntry = await request.json();
//     if (!hand.id) {
//       return NextResponse.json({ error: 'Hand ID is required' }, { status: 400 });
//     }
//     // Avoid duplicates
//     if (!handHistories.some(h => h.id === hand.id)) {
//       console.log('Storing new hand history:', hand);
//       handHistories.push(hand);
//     }
//     return NextResponse.json({ success: true, hand }, { status: 201 });
//   } catch (error) {
//     return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
//   }
// }
