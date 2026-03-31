// Shippo API Client for FPVGate Shop
// Handles shipping rate lookups and label purchases via Shippo's REST API

const SHIPPO_API_BASE = 'https://api.goshippo.com';

// Your return/from address - update with your actual details
const FROM_ADDRESS = {
    name: 'FPVGate',
    street1: 'Flat 3, 45 Waterloo Road',
    city: 'Bedford',
    state: '',
    zip: 'MK40 3PG',
    country: 'GB',
    phone: '',
    email: ''
};

// Default parcel dimensions for FPVGate AIO V3 in A6 padded letter
const DEFAULT_PARCEL = {
    length: 16.2,   // A6 padded letter length (cm)
    width: 11.4,    // A6 padded letter width (cm)
    height: 3,      // approximate thickness (cm)
    distance_unit: 'cm',
    weight: 100,    // grams
    mass_unit: 'g'
};

/**
 * Make an authenticated request to the Shippo API
 */
async function shippoRequest(token, endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Authorization': `ShippoToken ${token}`,
            'Content-Type': 'application/json'
        }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`${SHIPPO_API_BASE}${endpoint}`, options);

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Shippo API error (${response.status}): ${error}`);
    }

    return response.json();
}

/**
 * Create a shipment and get available rates
 * Returns the shipment object with rates array
 */
export async function getShippingRates(token, toAddress, parcel = null) {
    const shipment = await shippoRequest(token, '/shipments', 'POST', {
        address_from: FROM_ADDRESS,
        address_to: {
            name: toAddress.name || 'Customer',
            street1: toAddress.street1 || toAddress.address1,
            street2: toAddress.street2 || toAddress.address2 || '',
            city: toAddress.city,
            state: toAddress.state || toAddress.province || '',
            zip: toAddress.zip || toAddress.postalCode,
            country: toAddress.country,
            phone: toAddress.phone || '',
            email: toAddress.email || ''
        },
        parcels: [parcel || DEFAULT_PARCEL],
        async: false
    });

    return shipment;
}

/**
 * Purchase a shipping label for a given rate
 * Returns the transaction with tracking number and label URL
 */
export async function purchaseLabel(token, rateObjectId) {
    const transaction = await shippoRequest(token, '/transactions', 'POST', {
        rate: rateObjectId,
        label_file_type: 'PDF',
        async: false
    });

    if (transaction.status !== 'SUCCESS') {
        throw new Error(`Label purchase failed: ${JSON.stringify(transaction.messages)}`);
    }

    return {
        transactionId: transaction.object_id,
        trackingNumber: transaction.tracking_number,
        labelUrl: transaction.label_url,
        trackingUrlProvider: transaction.tracking_url_provider || ''
    };
}

/**
 * Get rates for a specific shipment by ID (for admin portal label creation)
 */
export async function getShipmentRates(token, shipmentId) {
    const shipment = await shippoRequest(token, `/shipments/${shipmentId}`);
    return shipment.rates || [];
}

/**
 * Transform Shippo rates into Snipcart's expected format
 */
export function transformRatesForSnipcart(shippoRates) {
    return shippoRates
        .filter(rate => rate.amount && parseFloat(rate.amount) > 0)
        .map(rate => {
            // Use a stable ID based on provider + service token so it matches
            // across multiple Snipcart webhook calls (fetch + validation)
            const serviceToken = rate.servicelevel?.token || rate.servicelevel?.name || 'standard';
            const stableId = `${rate.provider}_${serviceToken}`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
            return {
                cost: parseFloat(rate.amount),
                description: `${rate.provider} - ${rate.servicelevel?.name || 'Standard'}`,
                guaranteedDaysToDelivery: rate.estimated_days || null,
                userDefinedId: stableId
            };
        })
        .sort((a, b) => a.cost - b.cost);
}

/**
 * Fallback flat rates when Shippo is unavailable
 */
export function getFallbackRates(destinationCountry) {
    if (destinationCountry === 'GB') {
        return [{
            cost: 1.85,
            description: 'Royal Mail - UK Standard',
            guaranteedDaysToDelivery: 3
        }];
    }

    // European countries
    const europeCountries = [
        'IE', 'FR', 'DE', 'DK', 'AT', 'BE', 'BG', 'HR', 'CY', 'CZ',
        'EE', 'FI', 'GR', 'HU', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
        'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'NO', 'CH', 'IS',
        'TR', 'AL', 'AD', 'AM', 'AZ', 'BY', 'BA', 'GE', 'GI', 'GL',
        'KZ', 'XK', 'KG', 'LI', 'MD', 'ME', 'MK', 'MC', 'RS', 'SM',
        'TJ', 'TM', 'UA', 'UZ', 'VA', 'RU'
    ];

    if (europeCountries.includes(destinationCountry)) {
        return [{
            cost: 3.80,
            description: 'Royal Mail - International Standard (Europe)',
            guaranteedDaysToDelivery: 5
        }];
    }

    return [{
        cost: 4.60,
        description: 'Royal Mail - International Standard (Worldwide)',
        guaranteedDaysToDelivery: 7
    }];
}

export { FROM_ADDRESS, DEFAULT_PARCEL };
