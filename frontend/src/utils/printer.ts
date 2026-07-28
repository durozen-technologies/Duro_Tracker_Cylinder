import { AppState, NativeModules, PermissionsAndroid, Platform } from "react-native";
import {
  type IBLEPrinter,
  type PrinterImageOptions as NativePrinterImageOptions,
  type PrinterOptions as NativePrinterOptions,
} from "@haroldtran/react-native-thermal-printer";

import {
  PrinterDevice,
  PrinterSupportState,
  PrinterTransport,
} from "../types/printer";

const PAPER_WIDTH_58 = 32;

type ReceiptLineAlignment = "left" | "center";

type PrintableReceiptLine = {
  text: string;
  align?: ReceiptLineAlignment;
  bold?: boolean;
  doubleSize?: boolean;
};

type PrinterOptions = {
  beep?: boolean;
  cut?: boolean;
  tailingLine?: boolean;
  encoding?: string;
  onError?: (error: Error) => void;
};

type PrinterRuntime = {
  init: () => Promise<void>;
  getDeviceList: () => Promise<PrinterDevice[]>;
  connect: (device: PrinterDevice) => Promise<void>;
  closeConn: () => Promise<void>;
  printBill: (text: string, options?: PrinterOptions) => Promise<void>;
  printImageBase64: (base64: string, options?: NativePrinterImageOptions & { isLastSlice?: boolean }) => Promise<void>;
};

export type DeliveryReceiptItem = {
  name: string;
  quantity: number;
  price: number;
  total: number;
};

export type DeliveryReceiptData = {
  receipt_number: string;
  date: string;

  agency_name?: string;
  agency_address?: string;
  agency_mobile?: string;

  buyer_name: string;
  buyer_address: string;
  buyer_phone?: string;

  receipt_type?: 'DELIVERY' | 'PAYMENT' | 'TEST';
  opening_balance: number;

  items: DeliveryReceiptItem[];

  total_bill: number;
  cash_collected: number;
  upi_collected: number;

  closing_balance: number;
  cylinder_balances?: { name: string; count: number; given?: number; taken?: number }[];
};

const RECEIPT_COPY = {
  receipt: "Receipt",
  date: "Date",
  buyer: "Buyer",
  cash: "Cash",
  upi: "UPI",
  total: "Total",
  thankYou: "THANK YOU",
  poweredBy: "Powered by Duro Tracker",
};

export function formatCurrency(amount: number) {
  return `Rs. ${amount.toFixed(2)}`;
}

function formatDateTime(isoString: string) {
  return new Date(isoString).toLocaleString();
}

function getThermalPrinterModule() {
  return require("@haroldtran/react-native-thermal-printer") as {
    BLEPrinter: typeof import("@haroldtran/react-native-thermal-printer").BLEPrinter;
    USBPrinter: typeof import("@haroldtran/react-native-thermal-printer").USBPrinter;
    COMMANDS: typeof import("@haroldtran/react-native-thermal-printer").COMMANDS;
  };
}

function getCommandText() {
  const { COMMANDS } = getThermalPrinterModule();

  return {
    CENTER: COMMANDS.TEXT_FORMAT.TXT_ALIGN_CT,
    LEFT: COMMANDS.TEXT_FORMAT.TXT_ALIGN_LT,
    BOLD_ON: COMMANDS.TEXT_FORMAT.TXT_BOLD_ON,
    BOLD_OFF: COMMANDS.TEXT_FORMAT.TXT_BOLD_OFF,
    DOUBLE_SIZE:
      COMMANDS.TEXT_FORMAT.TXT_2HEIGHT +
      COMMANDS.TEXT_FORMAT.TXT_2WIDTH,
    NORMAL: COMMANDS.TEXT_FORMAT.TXT_NORMAL,
    DIVIDER: COMMANDS.HORIZONTAL_LINE.HR3_58MM,
  } as const;
}

function getAndroidApiLevel() {
  return typeof Platform.Version === "number"
    ? Platform.Version
    : Number(Platform.Version ?? 0);
}

function hasBluetoothModule() {
  return Boolean(NativeModules.RNBLEPrinter);
}

function hasUsbModule() {
  return Boolean(NativeModules.RNUSBPrinter);
}

async function requestBluetoothPermissions() {
  if (Platform.OS !== "android") {
    return true;
  }

  const apiLevel = getAndroidApiLevel();
  const permissions =
    apiLevel >= 31
      ? [
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];

  const statuses = await PermissionsAndroid.requestMultiple(permissions);
  return permissions.every(
    (permission) =>
      statuses[permission] === PermissionsAndroid.RESULTS.GRANTED,
  );
}

function getTransportLabel(transport: PrinterTransport) {
  return transport === "bluetooth" ? "Bluetooth" : "USB";
}

export function getSavedPrinterLabel(device: PrinterDevice) {
  return `${getTransportLabel(device.transport)} - ${device.name}`;
}

export function getPrinterDeviceDetail(device: PrinterDevice) {
  return device.transport === "bluetooth"
    ? device.address ?? device.deviceName ?? device.name
    : `${device.vendorId ?? "?"}/${device.productId ?? "?"}`;
}

function padColumns(left: string, right: string, width = PAPER_WIDTH_58) {
  const safeLeft = left.trim();
  const safeRight = right.trim();
  const spacing = Math.max(
    1,
    width - safeLeft.length - safeRight.length,
  );

  if (safeLeft.length + safeRight.length + 1 <= width) {
    return `${safeLeft}${" ".repeat(spacing)}${safeRight}`;
  }

  return `${safeLeft}\n${" ".repeat(
    Math.max(0, width - safeRight.length),
  )}${safeRight}`;
}

function formatDateForReceipt(isoString: string) {
  const d = new Date(isoString);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  const hh = String(hours).padStart(2, '0');
  return `${dd}-${mm}-${yyyy} , ${hh}:${minutes}${ampm}`;
}

/**
 * =========================================================
 *                  RECEIPT VISUAL LAYOUT
 * =========================================================
 *           Sree Hari Agencies
 *                     Namakkal
 *               Mobile: [Agency Mobile]
 * -----------------------------------------------
 * Bill No: [receipt_number]
 * Date: [date]
 * -----------------------------------------------
 *  To: 
 *   [Retailer Name]
 *   [Shop Name]
 * -----------------------------------------------
 *          Opening Balance: ₹[Amount]
 * -----------------------------------------------
 * Item       Qty            Total
 * [X]        [Y]            ₹[Total]
 * -----------------------------------------------
 * Total Bill Amount:         ₹[Total]
 * Cash Paid:                 ₹[Cash]
 * UPI Paid:                  ₹[UPI]
 * Balance Amount:            ₹[Current Bill Bal]
 * -----------------------------------------------
 *          Closing Balance: ₹[Amount]
 * -----------------------------------------------
 *                  Thank You
 *          Software Provided By
 *    Durozen Technologies Pvt. Ltd.
 * =========================================================
 */
export function buildPrintableReceiptLines(data: DeliveryReceiptData): PrintableReceiptLine[] {
  const divider = "-".repeat(PAPER_WIDTH_58);

  const lines: PrintableReceiptLine[] = [
    { text: data.agency_name || "Sree Hari Agencies", align: "center", bold: true, doubleSize: true },
    { text: data.agency_address || "Namakkal", align: "center" },
    { text: `Mobile: ${data.agency_mobile || "N/A"}`, align: "center" },
    { text: divider },
    { text: `                 Bill No : ${data.receipt_number}` },
    { text: `      Date : ${formatDateForReceipt(data.date)}` },
    { text: divider },
    { text: " To:", bold: true },
    { text: `  ${data.buyer_name}` },
    { text: `  ${data.buyer_address || ""}` },
    data.buyer_phone ? { text: `  Mobile: ${data.buyer_phone}` } : { text: "" },
    { text: divider },
    { text: padColumns("         Opening Balance:", `₹${data.opening_balance.toFixed(2)}`), bold: true },
    { text: divider },
    { text: "Kgs        Price/Kg            Total Amount", bold: true },
  ];

  for (const item of data.items) {
    // Format: Qty (3)  Price (8) -> Total (10)
    const qty = item.quantity.toString().padEnd(3);
    const price = `₹${item.price}`.padStart(8);
    const itemRowLeft = `${qty}        ${price}            `;
    lines.push({ text: padColumns(itemRowLeft, `₹${item.total}`) });
  }

  lines.push({ text: divider });
  lines.push({ text: padColumns("Total Bill Amount:", `₹${data.total_bill.toFixed(2)}`), bold: true });
  lines.push({ text: padColumns("Cash Paid:", `₹${data.cash_collected.toFixed(2)}`) });
  lines.push({ text: padColumns("UPI Paid:", `₹${data.upi_collected.toFixed(2)}`) });

  const currentBillBal = data.total_bill - (data.cash_collected + data.upi_collected);
  lines.push({ text: padColumns("Balance Amount:", `₹${currentBillBal.toFixed(2)}`) });

  lines.push({ text: divider });
  lines.push({ text: padColumns("         Closing Balance:", `₹${data.closing_balance.toFixed(2)}`), bold: true });
  lines.push({ text: divider });

  if (data.cylinder_balances && data.cylinder_balances.length > 0) {
    lines.push({ text: "Cylinders Holding :", align: "center", bold: true });
    for (const bal of data.cylinder_balances) {
      lines.push({ text: `* ${bal.name} - Given: ${bal.given || 0} Taken: ${bal.taken || 0} Hold: ${bal.count}`, align: "center" });
    }
    lines.push({ text: divider });
  }

  lines.push({ text: "                    Thank You", bold: true });
  lines.push({ text: "            Software Provided By" });
  lines.push({ text: "       Durozen Technologies Pvt. Ltd." });
  lines.push({ text: "" });
  lines.push({ text: "" });

  return lines;
}

function buildPrintableReceipt(data: DeliveryReceiptData) {
  const COMMAND_TEXT = getCommandText();

  return buildPrintableReceiptLines(data)
    .map((line) => {
      const alignCommand =
        line.align === "center" ? COMMAND_TEXT.CENTER : COMMAND_TEXT.LEFT;
      const sizeCommand = line.doubleSize
        ? COMMAND_TEXT.DOUBLE_SIZE
        : COMMAND_TEXT.NORMAL;
      const weightCommand = line.bold
        ? COMMAND_TEXT.BOLD_ON
        : COMMAND_TEXT.BOLD_OFF;

      return `${alignCommand}${sizeCommand}${weightCommand}${line.text}${COMMAND_TEXT.BOLD_OFF}${COMMAND_TEXT.NORMAL}`;
    })
    .join("\n");
}

function buildTestReceipt(device: PrinterDevice) {
  const COMMAND_TEXT = getCommandText();

  return [
    `${COMMAND_TEXT.CENTER}${COMMAND_TEXT.BOLD_ON}PRINTER CONNECTED${COMMAND_TEXT.BOLD_OFF}`,
    `${COMMAND_TEXT.LEFT}Name: ${device.name || "Unknown Printer"}`,
    device.address ? `Address: ${device.address}` : "",
    `Date & Time: ${formatDateForReceipt(new Date().toISOString())}`,
    COMMAND_TEXT.DIVIDER,
    `${COMMAND_TEXT.LEFT}                    ${COMMAND_TEXT.BOLD_ON}Thank You${COMMAND_TEXT.BOLD_OFF}`,
    "            Software Provided By",
    "       Durozen Technologies Pvt. Ltd.",
    "",
    "",
    "",
  ]
    .filter(Boolean)
    .join("\n");
}

function getPrintOptions(onError?: (error: Error) => void): NativePrinterOptions {
  return {
    beep: true,
    cut: true,
    tailingLine: true,
    encoding: "UTF8",
    onError,
  };
}

function toError(error: unknown) {
  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}

function isNoDeviceFound(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes("no device found");
}

function waitForPrintDispatch(
  dispatch: (options: NativePrinterOptions) => void,
  options: PrinterOptions = {},
  settleDelayMs = 400,
) {
  return new Promise<void>((resolve, reject) => {
    let settled = false;

    dispatch(
      getPrintOptions((error) => {
        if (settled) {
          return;
        }

        settled = true;
        options.onError?.(error);
        reject(toError(error));
      }),
    );

    setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      resolve();
    }, settleDelayMs);
  });
}

function getPrintImageOptions(onError?: (error: Error) => void): NativePrinterImageOptions {
  return {
    beep: true,
    cut: true,
    tailingLine: true,
    encoding: "UTF8",
    imageWidth: 380, // RECEIPT_IMAGE_WIDTH
    align: "center",
    onError,
  };
}

function getPrintImageSliceOptions(
  index: number,
  total: number,
  onError?: (error: Error) => void,
): NativePrinterImageOptions {
  const isLastSlice = index === total - 1;

  return {
    ...getPrintImageOptions(onError),
    beep: isLastSlice,
    cut: isLastSlice,
    tailingLine: isLastSlice,
  };
}

function waitForImagePrintDispatch(
  dispatch: (options: NativePrinterOptions) => void,
  options: PrinterOptions = {},
  isLastSlice = false,
) {
  // Image printing takes longer than text on many thermal drivers.
  // Wait 1800ms for mid-slices, 2000ms for the last slice to prevent buffer overflow
  return waitForPrintDispatch(dispatch, options, isLastSlice ? 2000 : 1800);
}

function normalizeBluetoothPrinter(printer: IBLEPrinter): PrinterDevice {
  return {
    id: `bluetooth:${printer.inner_mac_address}`,
    transport: "bluetooth",
    name: printer.device_name?.trim() || "Bluetooth Printer",
    address: printer.inner_mac_address,
    deviceName: printer.device_name,
  };
}

function dedupePrinters(devices: PrinterDevice[]) {
  const registry = new Map<string, PrinterDevice>();

  devices.forEach((device) => {
    registry.set(device.id, device);
  });

  return [...registry.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

function createBluetoothRuntime(): PrinterRuntime {
  if (!hasBluetoothModule()) {
    throw new Error(
      "Bluetooth printer support needs an Android development build or release build.",
    );
  }

  const { BLEPrinter } = getThermalPrinterModule();

  return {
    init: () => BLEPrinter.init(),
    getDeviceList: async () => {
      try {
        const printers = await BLEPrinter.getDeviceList();
        return dedupePrinters(printers.map(normalizeBluetoothPrinter));
      } catch (error) {
        if (isNoDeviceFound(error)) {
          return [];
        }

        throw toError(error);
      }
    },
    connect: async (device) => {
      if (!device.address) {
        throw new Error(
          "This Bluetooth printer is missing its device address.",
        );
      }

      await BLEPrinter.connectPrinter(device.address);
    },
    closeConn: () => BLEPrinter.closeConn(),
    printBill: (text, options = {}) =>
      waitForPrintDispatch(
        (nativeOptions) => BLEPrinter.printBill(text, nativeOptions),
        options,
      ),
    printImageBase64: (base64, options = {}) =>
      waitForImagePrintDispatch(
        (nativeOptions) =>
          BLEPrinter.printImageBase64(base64, {
            ...getPrintImageOptions(nativeOptions.onError),
            ...options,
          }),
        options,
        options.isLastSlice
      ),
  };
}

async function ensureBluetoothPrinterReady() {
  if (Platform.OS !== "android") {
    throw new Error(
      "Bluetooth receipt printing is currently available only on Android.",
    );
  }

  if (!hasBluetoothModule()) {
    throw new Error(
      "Bluetooth printer support needs an Android development build or release build.",
    );
  }

  const permissionGranted = await requestBluetoothPermissions();
  if (!permissionGranted) {
    throw new Error(
      "Bluetooth permissions were denied. Allow printer permissions and try again.",
    );
  }

  const runtime = createBluetoothRuntime();
  await runtime.init();
  return runtime;
}

async function getPrinterRuntime(device: PrinterDevice) {
  return ensureBluetoothPrinterReady();
}

async function closePrinterConnection(printer: PrinterRuntime) {
  try {
    await printer.closeConn();
  } catch {
    // Some devices throw here when no session is open, which is safe to ignore.
  }
}

async function connectWithRetry(
  printer: PrinterRuntime,
  device: PrinterDevice,
) {
  try {
    await printer.connect(device);
  } catch (error) {
    await closePrinterConnection(printer);

    try {
      await printer.connect(device);
    } catch {
      throw toError(error);
    }
  }
}

type ActivePrinterSession = {
  device: PrinterDevice;
  runtime: PrinterRuntime;
};

let activePrinterSession: ActivePrinterSession | null = null;
let printerIdleTimer: NodeJS.Timeout | null = null;
let printerJobQueue: (() => Promise<void>)[] = [];
let isPrinting = false;

// When the app goes to background, disconnect the printer to avoid holding Bluetooth hostage
AppState.addEventListener("change", (nextAppState) => {
  if (nextAppState.match(/inactive|background/)) {
    if (activePrinterSession) {
      closePrinterConnection(activePrinterSession.runtime).catch(() => {});
      activePrinterSession = null;
    }
    if (printerIdleTimer) {
      clearTimeout(printerIdleTimer);
      printerIdleTimer = null;
    }
  }
});

async function processPrinterQueue() {
  if (isPrinting) {
    return;
  }

  const job = printerJobQueue.shift();
  if (!job) {
    // Queue is empty, start idle timer to disconnect after 15 seconds of inactivity
    if (!printerIdleTimer && activePrinterSession) {
      printerIdleTimer = setTimeout(() => {
        if (activePrinterSession) {
          closePrinterConnection(activePrinterSession.runtime).catch(() => {});
          activePrinterSession = null;
        }
        printerIdleTimer = null;
      }, 15000);
    }
    return;
  }

  isPrinting = true;
  // Clear the idle timer since we are actively printing
  if (printerIdleTimer) {
    clearTimeout(printerIdleTimer);
    printerIdleTimer = null;
  }

  try {
    await job();
  } catch (error) {
    console.error("Printer Job Error:", error);
  } finally {
    isPrinting = false;
    // Process next job
    processPrinterQueue();
  }
}

function enqueuePrinterJob<T>(
  job: () => Promise<T>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    printerJobQueue.push(async () => {
      try {
        const result = await job();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });

    processPrinterQueue();
  });
}

async function getOrCreatePrinterSession(device: PrinterDevice): Promise<PrinterRuntime> {
  // If we already have a session for a DIFFERENT printer, close it first
  if (activePrinterSession && activePrinterSession.device.id !== device.id) {
    await closePrinterConnection(activePrinterSession.runtime).catch(() => {});
    activePrinterSession = null;
  }

  // If we don't have a session, create and connect
  if (!activePrinterSession) {
    const runtime = await getPrinterRuntime(device);
    // Disconnect just in case an old ghost connection exists
    await closePrinterConnection(runtime);
    await connectWithRetry(runtime, device);
    
    activePrinterSession = {
      device,
      runtime,
    };
  }

  return activePrinterSession.runtime;
}

export function getPrinterSupportState(): PrinterSupportState {
  if (Platform.OS !== "android") {
    return {
      supported: false,
      bluetooth: false,
      usb: false,
      reason:
        "Direct Bluetooth and USB thermal printing are currently available only on Android.",
    };
  }

  const bluetooth = hasBluetoothModule();
  const usb = hasUsbModule();

  if (!bluetooth && !usb) {
    return {
      supported: false,
      bluetooth: false,
      usb: false,
      reason:
        "Printer support needs an Android development build or release build. Expo Go cannot load these native printer modules.",
    };
  }

  return {
    supported: true,
    bluetooth,
    usb,
  };
}

export async function loadBluetoothPrinters() {
  const printer = await ensureBluetoothPrinterReady();
  return printer.getDeviceList();
}

export async function loadUsbPrinters() {
  return []; // Mocked out for Tracker
}

export async function connectPrinterDevice(device: PrinterDevice) {
  return enqueuePrinterJob(async () => {
    await getOrCreatePrinterSession(device);
    return device;
  });
}

export async function printTestReceipt(device: PrinterDevice) {
  return enqueuePrinterJob(async () => {
    const printer = await getOrCreatePrinterSession(device);
    const payload = buildTestReceipt(device);
    await printer.printBill(payload);

    // Dynamic buffer drain delay
    const drainDelay = Math.max(1200, Math.min(6000, Math.floor((payload.length / 2500) * 1000)));
    await new Promise((resolve) => setTimeout(resolve, drainDelay));
  });
}

export async function printDeliveryReceipt(
  data: DeliveryReceiptData,
  device: PrinterDevice,
) {
  return enqueuePrinterJob(async () => {
    const printer = await getOrCreatePrinterSession(device);
    const payload = buildPrintableReceipt(data);
    await printer.printBill(payload);

    // Dynamic buffer drain delay
    const drainDelay = Math.max(1200, Math.min(6000, Math.floor((payload.length / 2500) * 1000)));
    await new Promise((resolve) => setTimeout(resolve, drainDelay));
  });
}

export async function printReceiptImageBase64WithPrinter(
  base64Chunks: string[],
  device: PrinterDevice,
) {
  if (base64Chunks.length === 0) {
    return;
  }

  return enqueuePrinterJob(async () => {
    const printer = await getOrCreatePrinterSession(device);

    for (let index = 0; index < base64Chunks.length; index += 1) {
      const base64Chunk = base64Chunks[index];
      const isLastSlice = index === base64Chunks.length - 1;
      await printer.printImageBase64(
        base64Chunk,
        {
          ...getPrintImageSliceOptions(index, base64Chunks.length),
          isLastSlice
        }
      );
    }
  });
}
