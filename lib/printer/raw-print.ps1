param(
    [Parameter(Mandatory = $true)][string]$PrinterName,
    [Parameter(Mandatory = $true)][string]$FilePath
)

$ErrorActionPreference = "Stop"

Add-Type -Namespace ScreenbRawPrint -Name Native -MemberDefinition @'
[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
public struct DOCINFOW
{
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
}

[DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

[DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
public static extern bool ClosePrinter(IntPtr hPrinter);

[DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
public static extern bool StartDocPrinter(IntPtr hPrinter, int level, ref DOCINFOW pDocInfo);

[DllImport("winspool.drv", SetLastError = true)]
public static extern bool EndDocPrinter(IntPtr hPrinter);

[DllImport("winspool.drv", SetLastError = true)]
public static extern bool StartPagePrinter(IntPtr hPrinter);

[DllImport("winspool.drv", SetLastError = true)]
public static extern bool EndPagePrinter(IntPtr hPrinter);

[DllImport("winspool.drv", SetLastError = true)]
public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);
'@

function Get-Win32ErrorMessage {
    param([int]$Code)
    (New-Object System.ComponentModel.Win32Exception($Code)).Message
}

$bytes = [System.IO.File]::ReadAllBytes($FilePath)

$hPrinter = [IntPtr]::Zero
if (-not [ScreenbRawPrint.Native]::OpenPrinter($PrinterName, [ref]$hPrinter, [IntPtr]::Zero)) {
    $code = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
    throw "OpenPrinter failed for '$PrinterName': $(Get-Win32ErrorMessage $code) (code $code)"
}

try {
    $docInfo = New-Object ScreenbRawPrint.Native+DOCINFOW
    $docInfo.pDocName = "Queue Ticket"
    $docInfo.pOutputFile = $null
    $docInfo.pDataType = "RAW"

    if (-not [ScreenbRawPrint.Native]::StartDocPrinter($hPrinter, 1, [ref]$docInfo)) {
        $code = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
        throw "StartDocPrinter failed: $(Get-Win32ErrorMessage $code) (code $code)"
    }

    try {
        if (-not [ScreenbRawPrint.Native]::StartPagePrinter($hPrinter)) {
            $code = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
            throw "StartPagePrinter failed: $(Get-Win32ErrorMessage $code) (code $code)"
        }

        $written = 0
        if (-not [ScreenbRawPrint.Native]::WritePrinter($hPrinter, $bytes, $bytes.Length, [ref]$written)) {
            $code = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
            throw "WritePrinter failed: $(Get-Win32ErrorMessage $code) (code $code)"
        }
        if ($written -ne $bytes.Length) {
            throw "WritePrinter wrote $written of $($bytes.Length) bytes"
        }

        [ScreenbRawPrint.Native]::EndPagePrinter($hPrinter) | Out-Null
    }
    finally {
        [ScreenbRawPrint.Native]::EndDocPrinter($hPrinter) | Out-Null
    }
}
finally {
    [ScreenbRawPrint.Native]::ClosePrinter($hPrinter) | Out-Null
}

Write-Output "RAWPRINT_OK $written bytes"
