// Shippo API Client for FPVGate Shop
// Handles shipping rate lookups and label purchases via Shippo's REST API

const SHIPPO_API_BASE = 'https://api.goshippo.com';
const DEFAULT_LABEL_FILE_TYPE = 'PDF_4x6';
const SUPPORTED_LABEL_FILE_TYPES = [
    'PNG',
    'PNG_2.3x7.5',
    'PDF',
    'PDF_2.3x7.5',
    'PDF_4x6',
    'PDF_4x8',
    'PDF_A4',
    'PDF_A5',
    'PDF_A6',
    'ZPLII'
];

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

function toPositiveNumber(value, fallback = 0) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toPositiveInt(value, fallback = 1) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getItemDimension(item, keys = []) {
    for (const key of keys) {
        const dimension = toPositiveNumber(item?.[key], 0);
        if (dimension > 0) return dimension;
    }
    return 0;
}

export function buildParcelFromItems(items = [], baseParcel = DEFAULT_PARCEL) {
    const defaultLength = toPositiveNumber(baseParcel.length, DEFAULT_PARCEL.length);
    const defaultWidth = toPositiveNumber(baseParcel.width, DEFAULT_PARCEL.width);
    const defaultHeight = toPositiveNumber(baseParcel.height, DEFAULT_PARCEL.height);
    const defaultWeight = toPositiveInt(baseParcel.weight, DEFAULT_PARCEL.weight);

    let totalUnits = 0;
    let totalWeight = 0;
    let totalVolume = 0;

    (Array.isArray(items) ? items : []).forEach((item) => {
        const quantity = toPositiveInt(item?.quantity, 1);
        const itemWeight = toPositiveNumber(item?.weight, defaultWeight);
        totalUnits += quantity;
        totalWeight += itemWeight * quantity;

        const itemLength = getItemDimension(item, ['length', 'length_cm', 'parcel_length_cm']);
        const itemWidth = getItemDimension(item, ['width', 'width_cm', 'parcel_width_cm']);
        const itemHeight = getItemDimension(item, ['height', 'height_cm', 'parcel_height_cm']);
        if (itemLength && itemWidth && itemHeight) {
            totalVolume += itemLength * itemWidth * itemHeight * quantity;
        }
    });

    const safeWeight = Math.max(1, Math.round(totalWeight || defaultWeight));
    let length = defaultLength;
    let width = defaultWidth;
    let height = defaultHeight;

    if (totalVolume > 0) {
        const footprint = defaultLength * defaultWidth;
        if (footprint > 0) {
            height = Math.max(defaultHeight, Number((totalVolume / footprint).toFixed(1)));
        }
    } else if (totalUnits > 1) {
        height = Number((defaultHeight * Math.ceil(totalUnits / 2)).toFixed(1));
    }

    const weightMultiplier = safeWeight / Math.max(1, defaultWeight);
    if (weightMultiplier > 2) {
        const sideScale = Math.min(2.2, Math.sqrt(weightMultiplier / 2));
        length = Number((length * sideScale).toFixed(1));
        width = Number((width * sideScale).toFixed(1));
    }

    if (totalUnits > 4) {
        const packScale = Math.min(1.8, 1 + (totalUnits - 4) * 0.08);
        length = Number((length * packScale).toFixed(1));
        width = Number((width * Math.min(packScale, 1.5)).toFixed(1));
    }

    return {
        length,
        width,
        height: Number(Math.max(1, height).toFixed(1)),
        distance_unit: baseParcel.distance_unit || DEFAULT_PARCEL.distance_unit,
        weight: safeWeight,
        mass_unit: baseParcel.mass_unit || DEFAULT_PARCEL.mass_unit
    };
}

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
 * Create a customs declaration via the Shippo Customs Declarations API.
 * Returns the object_id to reference in shipment creation.
 * Required by carriers like DPD UK for non-GB destinations.
 */
async function createCustomsDeclaration(token, items = [], eoriNumber = '') {
    const customsItems = items.length > 0
        ? items.map(item => ({
            description: item.name || 'FPV Electronics',
            quantity: item.quantity || 1,
            net_weight: String(item.weight || 100),
            mass_unit: 'g',
            value_amount: String(item.price || '0'),
            value_currency: 'GBP',
            origin_country: 'GB',
            tariff_number: '9106100000'
        }))
        : [{
            description: 'FPV Electronics',
            quantity: 1,
            net_weight: '100',
            mass_unit: 'g',
            value_amount: '0',
            value_currency: 'GBP',
            origin_country: 'GB',
            tariff_number: '9106100000'
        }];

    const declarationData = {
        contents_type: 'MERCHANDISE',
        non_delivery_option: 'RETURN',
        certify: true,
        certify_signer: 'Louis Hitchcock',
        incoterm: 'DDU',
        items: customsItems
    };

    if (eoriNumber) {
        declarationData.exporter_identification = {
            eori_number: eoriNumber,
            tax_id: {
                number: eoriNumber,
                type: 'VAT'
            }
        };
    }

    const declaration = await shippoRequest(token, '/customs/declarations/', 'POST', declarationData);

    return declaration.object_id;
}

/**
 * Create a shipment and get available rates
 * Returns the shipment object with rates array
 * @param {string} token - Shippo API token
 * @param {object} toAddress - Destination address
 * @param {object|null} parcel - Parcel dimensions (uses default if null)
 * @param {array} items - Order items for customs declaration (optional)
 */
export async function getShippingRates(token, toAddress, parcel = null, items = [], eoriNumber = '') {
    const destCountry = toAddress.country || toAddress.countryCode || '';
    const isInternational = destCountry && destCountry !== 'GB';
    const resolvedParcel = parcel || buildParcelFromItems(items, DEFAULT_PARCEL);

    const shipmentData = {
        address_from: FROM_ADDRESS,
        address_to: {
            name: toAddress.name || 'Customer',
            street1: toAddress.street1 || toAddress.address1,
            street2: toAddress.street2 || toAddress.address2 || '',
            city: toAddress.city,
            state: toAddress.state || toAddress.province || '',
            zip: toAddress.zip || toAddress.postalCode,
            country: destCountry,
            phone: toAddress.phone || '',
            email: toAddress.email || ''
        },
        parcels: [resolvedParcel],
        async: false
    };

    if (isInternational) {
        const customsId = await createCustomsDeclaration(token, items, eoriNumber);
        shipmentData.customs_declaration = customsId;
    }

    const shipment = await shippoRequest(token, '/shipments', 'POST', shipmentData);
    return shipment;
}

/**
 * Purchase a shipping label for a given rate
 * Returns the transaction with tracking number and label URL
 */
export async function purchaseLabel(token, rateObjectId, requestedLabelFileType = DEFAULT_LABEL_FILE_TYPE) {
    const labelFileType = resolveLabelFileType(requestedLabelFileType);
    const transaction = await shippoRequest(token, '/transactions', 'POST', {
        rate: rateObjectId,
        label_file_type: labelFileType,
        async: false
    });

    if (transaction.status !== 'SUCCESS') {
        throw new Error(`Label purchase failed: ${JSON.stringify(transaction.messages)}`);
    }

    return {
        transactionId: transaction.object_id,
        trackingNumber: transaction.tracking_number,
        labelUrl: transaction.label_url,
        labelFileType: transaction.label_file_type || labelFileType,
        trackingUrlProvider: transaction.tracking_url_provider || ''
    };
}

function resolveLabelFileType(labelFileType = DEFAULT_LABEL_FILE_TYPE) {
    const normalized = String(labelFileType || '').trim();
    if (!normalized) return DEFAULT_LABEL_FILE_TYPE;
    const matched = SUPPORTED_LABEL_FILE_TYPES.find(type => type.toLowerCase() === normalized.toLowerCase());
    return matched || DEFAULT_LABEL_FILE_TYPE;
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
export async function getReturnRates(token, fromCustomerAddress, parcel = null, items = [], eoriNumber = '') {
    const srcCountry = fromCustomerAddress.country || '';
    const isInternational = srcCountry && srcCountry !== 'GB';
    const resolvedParcel = parcel || buildParcelFromItems(items, DEFAULT_PARCEL);

    const shipmentData = {
        address_from: {
            name: fromCustomerAddress.name || 'Customer',
            street1: fromCustomerAddress.street1 || fromCustomerAddress.address1,
            street2: fromCustomerAddress.street2 || fromCustomerAddress.address2 || '',
            city: fromCustomerAddress.city,
            state: fromCustomerAddress.state || fromCustomerAddress.province || '',
            zip: fromCustomerAddress.zip || fromCustomerAddress.postalCode,
            country: srcCountry,
            phone: fromCustomerAddress.phone || '',
            email: fromCustomerAddress.email || ''
        },
        address_to: FROM_ADDRESS,
        parcels: [resolvedParcel],
        async: false
    };

    if (isInternational) {
        const customsId = await createCustomsDeclaration(token, items, eoriNumber);
        shipmentData.customs_declaration = customsId;
    }

    const shipment = await shippoRequest(token, '/shipments', 'POST', shipmentData);
    return shipment;
}

export { FROM_ADDRESS, DEFAULT_PARCEL, DEFAULT_LABEL_FILE_TYPE };
