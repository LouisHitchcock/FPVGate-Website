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
 * Transform Shippo rates into Stripe shipping_options format
 * Returns array of objects for Stripe Checkout Session shipping_options
 */
export function transformRatesForStripe(shippoRates, currency = 'gbp') {
    return shippoRates
        .filter(rate => rate.amount && parseFloat(rate.amount) > 0)
        .map(rate => {
            const name = `${rate.provider} - ${rate.servicelevel?.name || 'Standard'}`;
            const days = rate.estimated_days;
            return {
                shipping_rate_data: {
                    type: 'fixed_amount',
                    fixed_amount: {
                        amount: Math.round(parseFloat(rate.amount) * 100), // Stripe uses pence/cents
                        currency
                    },
                    display_name: name,
                    delivery_estimate: days ? {
                        minimum: { unit: 'business_day', value: Math.max(1, days - 1) },
                        maximum: { unit: 'business_day', value: days + 1 }
                    } : undefined
                }
            };
        })
        .sort((a, b) => a.shipping_rate_data.fixed_amount.amount - b.shipping_rate_data.fixed_amount.amount);
}

/**
 * Fallback flat rates when Shippo is unavailable
 */
/**
 * Fallback flat rates when Shippo is unavailable
 * Returns rates in the same format as transformRatesForStripe
 */
export function getFallbackShippingOptions(destinationCountry, currency = 'gbp') {
    const rates = [];

    if (destinationCountry === 'GB') {
        rates.push({ amount: 185, name: 'Royal Mail - UK Standard', minDays: 2, maxDays: 4 });
    } else {
        const europeCountries = [
            'IE', 'FR', 'DE', 'DK', 'AT', 'BE', 'BG', 'HR', 'CY', 'CZ',
            'EE', 'FI', 'GR', 'HU', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
            'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'NO', 'CH', 'IS',
            'TR', 'AL', 'AD', 'AM', 'AZ', 'BY', 'BA', 'GE', 'GI', 'GL',
            'KZ', 'XK', 'KG', 'LI', 'MD', 'ME', 'MK', 'MC', 'RS', 'SM',
            'TJ', 'TM', 'UA', 'UZ', 'VA', 'RU'
        ];
        if (europeCountries.includes(destinationCountry)) {
            rates.push({ amount: 380, name: 'Royal Mail - International Standard (Europe)', minDays: 4, maxDays: 7 });
        } else {
            rates.push({ amount: 460, name: 'Royal Mail - International Standard (Worldwide)', minDays: 6, maxDays: 10 });
        }
    }

    return rates.map(r => ({
        shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: r.amount, currency },
            display_name: r.name,
            delivery_estimate: {
                minimum: { unit: 'business_day', value: r.minDays },
                maximum: { unit: 'business_day', value: r.maxDays }
            }
        }
    }));
}

/**
 * Create a RETURN shipment (addresses swapped: customer -> FPVGate)
 * Returns the shipment object with rates array
 */
export async function getReturnRates(token, fromCustomerAddress, parcel = null) {
    const shipment = await shippoRequest(token, '/shipments', 'POST', {
        address_from: {
            name: fromCustomerAddress.name || 'Customer',
            street1: fromCustomerAddress.street1 || fromCustomerAddress.address1,
            street2: fromCustomerAddress.street2 || fromCustomerAddress.address2 || '',
            city: fromCustomerAddress.city,
            state: fromCustomerAddress.state || fromCustomerAddress.province || '',
            zip: fromCustomerAddress.zip || fromCustomerAddress.postalCode,
            country: fromCustomerAddress.country,
            phone: fromCustomerAddress.phone || '',
            email: fromCustomerAddress.email || ''
        },
        address_to: FROM_ADDRESS,
        parcels: [parcel || DEFAULT_PARCEL],
        async: false
    });

    return shipment;
}

export { FROM_ADDRESS, DEFAULT_PARCEL };
