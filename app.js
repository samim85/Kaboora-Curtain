const express = require("express");
const sql = require("mssql/msnodesqlv8");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// =====================================================
// تنظیمات دیتابیس
// =====================================================

const dbConfig = {
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    driver: process.env.DB_DRIVER,
    options: {
        trustedConnection: true,
        trustServerCertificate: true
    }
};

// =====================================================
// اتصال به SQL Server
// =====================================================

sql.connect(dbConfig)
    .then(() => {
        console.log("✅ Connected to SQL Server");
    })
    .catch((err) => {
        console.error("❌ SQL Server connection failed:");
        console.error(err);
    });

// =====================================================
// صفحه اصلی
// =====================================================

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/index.html");
});

// =====================================================
// API مشتریان
// =====================================================

// دریافت مشتریان
app.get("/api/customers", async (req, res) => {
    try {
        const result = await sql.query(`
            SELECT
                Id,
                FullName,
                Phone,
                Address,
                CreatedAt
            FROM Customers
            ORDER BY Id DESC
        `);

        res.json(result.recordset);

    } catch (err) {
        console.error("❌ Error getting customers:", err);

        res.status(500).json({
            error: "خطا در دریافت مشتریان",
            details: err.message
        });
    }
});
// =====================================================
// ویرایش مشتری
// =====================================================

app.put("/api/customers/:id", async (req, res) => {

    try {

        const customerId =
            Number(req.params.id);

        const {
            FullName,
            Phone,
            Address
        } = req.body;


        if (!customerId || customerId <= 0) {

            return res.status(400).json({
                error: "شناسه مشتری نامعتبر است"
            });

        }


        if (!FullName || !FullName.trim()) {

            return res.status(400).json({
                error: "نام مشتری الزامی است"
            });

        }


        const pool =
            await sql.connect(dbConfig);


        const result =
            await pool.request()

                .input(
                    "Id",
                    sql.Int,
                    customerId
                )

                .input(
                    "FullName",
                    sql.NVarChar(200),
                    FullName.trim()
                )

                .input(
                    "Phone",
                    sql.NVarChar(50),
                    Phone || null
                )

                .input(
                    "Address",
                    sql.NVarChar(500),
                    Address || null
                )

                .query(`

                    UPDATE Customers

                    SET
                        FullName = @FullName,
                        Phone = @Phone,
                        Address = @Address

                    OUTPUT
                        INSERTED.Id,
                        INSERTED.FullName,
                        INSERTED.Phone,
                        INSERTED.Address,
                        INSERTED.CreatedAt

                    WHERE Id = @Id

                `);


        if (
            result.recordset.length === 0
        ) {

            return res.status(404).json({
                error: "مشتری پیدا نشد"
            });

        }


        res.json({

            success: true,

            message:
                "اطلاعات مشتری با موفقیت ویرایش شد ✅",

            customer:
                result.recordset[0]

        });


    } catch (err) {

        console.error(
            "❌ Error editing customer:",
            err
        );


        res.status(500).json({

            error:
                "خطا در ویرایش مشتری",

            details:
                err.message

        });

    }

});
// ثبت مشتری
app.post("/api/customers", async (req, res) => {
    try {

        const {
            FullName,
            Phone,
            Address
        } = req.body;

        if (!FullName || !FullName.trim()) {
            return res.status(400).json({
                error: "نام مشتری الزامی است"
            });
        }

        const request = new sql.Request();

        request.input(
            "FullName",
            sql.NVarChar(200),
            FullName.trim()
        );

        request.input(
            "Phone",
            sql.NVarChar(50),
            Phone || null
        );

        request.input(
            "Address",
            sql.NVarChar(500),
            Address || null
        );

        const result = await request.query(`
            INSERT INTO Customers
            (
                FullName,
                Phone,
                Address
            )
            OUTPUT
                INSERTED.Id,
                INSERTED.FullName,
                INSERTED.Phone,
                INSERTED.Address,
                INSERTED.CreatedAt
            VALUES
            (
                @FullName,
                @Phone,
                @Address
            )
        `);

        res.status(201).json({
            message: "مشتری با موفقیت ثبت شد",
            customer: result.recordset[0]
        });

    } catch (err) {

        console.error("❌ Error adding customer:", err);

        res.status(500).json({
            error: "خطا در ثبت مشتری",
            details: err.message
        });
    }
});
// =====================================================
// حذف مشتری به صورت امن
// =====================================================

app.delete("/api/customers/:id", async (req, res) => {

    try {

        const customerId =
            Number(req.params.id);


        if (!customerId || customerId <= 0) {

            return res.status(400).json({
                error: "شناسه مشتری نامعتبر است"
            });

        }


        const pool =
            await sql.connect(dbConfig);


        // =================================================
        // بررسی وجود مشتری
        // =================================================

        const customerResult =
            await pool.request()

                .input(
                    "CustomerId",
                    sql.Int,
                    customerId
                )

                .query(`
                    SELECT
                        Id,
                        FullName
                    FROM Customers
                    WHERE Id = @CustomerId
                `);


        if (
            customerResult.recordset.length === 0
        ) {

            return res.status(404).json({
                error: "مشتری پیدا نشد"
            });

        }


        // =================================================
        // بررسی بل‌های مشتری
        // =================================================

        const billResult =
            await pool.request()

                .input(
                    "CustomerId",
                    sql.Int,
                    customerId
                )

                .query(`
                    SELECT
                        COUNT(*) AS BillCount
                    FROM Bills
                    WHERE CustomerId = @CustomerId
                `);


        const billCount =
            Number(
                billResult.recordset[0].BillCount || 0
            );


        // =================================================
        // اگر مشتری بل داشته باشد، حذف ممنوع
        // =================================================

        if (billCount > 0) {

            return res.status(409).json({

                error:
                    "این مشتری دارای بل ثبت‌شده است و حذف نمی‌شود.",

                billCount:
                    billCount

            });

        }


        // =================================================
        // حذف مشتری
        // =================================================

        await pool.request()

            .input(
                "CustomerId",
                sql.Int,
                customerId
            )

            .query(`
                DELETE FROM Customers
                WHERE Id = @CustomerId
            `);


        res.json({

            success:
                true,

            message:
                "مشتری با موفقیت حذف شد ✅"

        });


    } catch (err) {

        console.error(
            "❌ Error deleting customer:",
            err
        );


        res.status(500).json({

            error:
                "خطا در حذف مشتری",

            details:
                err.message

        });

    }

});

// =====================================================
// شماره بل بعدی
// =====================================================

app.get("/api/bills/next-number", async (req, res) => {
    try {

        const result = await sql.query(`
            SELECT
                ISNULL(MAX(BillNumber), 0) + 1 AS BillNumber
            FROM Bills
        `);

        res.json({
            BillNumber: result.recordset[0].BillNumber
        });

    } catch (err) {

        console.error("❌ Error getting next bill number:", err);

        res.status(500).json({
            error: "خطا در دریافت شماره بل بعدی",
            details: err.message
        });
    }
});

// =====================================================
// ثبت کامل بل
// =====================================================

app.post("/api/bills", async (req, res) => {

    const transaction = new sql.Transaction();

    try {

        const {
            BillNumber,
            CustomerId,
            BillDate,
            DeliveryDate,

            TotalAmount,
            ReceiptAmount,
            PaymentDate,
            PaymentDescription,

            mattressItems,
            curtainItems
        } = req.body;

        // -------------------------------------------------
        // بررسی اطلاعات اصلی
        // -------------------------------------------------

        if (!BillNumber || !CustomerId || !BillDate) {
            return res.status(400).json({
                error: "شماره بل، مشتری و تاریخ بل الزامی است"
            });
        }

        const total = Number(TotalAmount || 0);
        const receipt = Number(ReceiptAmount || 0);

        if (isNaN(total) || total < 0) {
            return res.status(400).json({
                error: "مجموع بل نامعتبر است"
            });
        }

        if (isNaN(receipt) || receipt < 0 || receipt > total) {
            return res.status(400).json({
                error: "مبلغ رسید نامعتبر است"
            });
        }

        // -------------------------------------------------
        // شروع Transaction
        // -------------------------------------------------

        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

        // =================================================
        // ثبت بل اصلی
        // =================================================

        const billRequest = new sql.Request(transaction);

        billRequest.input(
            "BillNumber",
            sql.Int,
            Number(BillNumber)
        );

        billRequest.input(
            "CustomerId",
            sql.Int,
            Number(CustomerId)
        );

        billRequest.input(
            "BillDate",
            sql.Date,
            BillDate
        );

        billRequest.input(
            "DeliveryDate",
            sql.Date,
            DeliveryDate || null
        );

        billRequest.input(
            "TotalAmount",
            sql.Decimal(18, 2),
            total
        );

        const billResult = await billRequest.query(`
            INSERT INTO Bills
            (
                BillNumber,
                CustomerId,
                BillDate,
                DeliveryDate,
                TotalAmount
            )
            OUTPUT
                INSERTED.Id,
                INSERTED.BillNumber,
                INSERTED.CustomerId,
                INSERTED.BillDate,
                INSERTED.DeliveryDate,
                INSERTED.TotalAmount,
                INSERTED.CreatedAt
            VALUES
            (
                @BillNumber,
                @CustomerId,
                @BillDate,
                @DeliveryDate,
                @TotalAmount
            )
        `);

        const bill = billResult.recordset[0];

        // =================================================
        // ثبت تشک و بالشت
        // =================================================

        if (Array.isArray(mattressItems)) {

            for (const item of mattressItems) {

                const request = new sql.Request(transaction);

                // -------------------------------------------------
                // اطلاعات اصلی
                // -------------------------------------------------

                request.input(
                    "BillId",
                    sql.Int,
                    bill.Id
                );

                request.input(
                    "TailorId",
                    sql.Int,
                    item.TailorId || null
                );

                request.input(
                    "Simple",
                    sql.Int,
                    Number(item.Simple || 0)
                );

                request.input(
                    "SajafDar",
                    sql.Int,
                    Number(item.SajafDar || 0)
                );

                request.input(
                    "Boxi",
                    sql.Int,
                    Number(item.Boxi || 0)
                );

                request.input(
                    "DesignDar",
                    sql.Int,
                    Number(item.DesignDar || 0)
                );

                request.input(
                    "ZirPoosh",
                    sql.Int,
                    Number(item.ZirPoosh || 0)
                );

                request.input(
                    "MattressCount",
                    sql.Int,
                    Number(item.MattressCount || 0)
                );

                request.input(
                    "PillowCount",
                    sql.Int,
                    Number(item.PillowCount || 0)
                );

                request.input(
                    "SmallPillowCount",
                    sql.Int,
                    Number(item.SmallPillowCount || 0)
                );

                request.input(
                    "RollPillowCount",
                    sql.Int,
                    Number(item.RollPillowCount || 0)
                );

                // -------------------------------------------------
                // اطلاعات پارچه و قیمت مشتری
                // -------------------------------------------------

                request.input(
                    "FabricMeters",
                    sql.Decimal(18, 2),
                    Number(item.FabricMeters || 0)
                );

                request.input(
                    "FabricPrice",
                    sql.Decimal(18, 2),
                    Number(item.FabricPrice || 0)
                );

                request.input(
                    "SewingPrice",
                    sql.Decimal(18, 2),
                    Number(item.SewingPrice || 0)
                );

                // =================================================
                // محاسبه دستمزد خیاط تشک
                // =================================================
                // توجه:
                // دستمزد خیاط هیچ ارتباطی با FabricMeters ندارد.
                // هر نوع کار نرخ مخصوص خودش را دارد.
                // =================================================

                const mattressCount =
                    Number(item.MattressCount || 0);

                const pillowCount =
                    Number(item.PillowCount || 0);

                const smallPillowCount =
                    Number(item.SmallPillowCount || 0);

                const rollPillowCount =
                    Number(item.RollPillowCount || 0);

                const tailorSimplePrice =
                    Number(item.TailorSimplePrice || 0);

                const tailorSajafDarPrice =
                    Number(item.TailorSajafDarPrice || 0);

                const tailorBoxiPrice =
                    Number(item.TailorBoxiPrice || 0);

                const tailorDesignDarPrice =
                    Number(item.TailorDesignDarPrice || 0);

                const tailorZirPooshPrice =
                    Number(item.TailorZirPooshPrice || 0);

                const tailorPillowPrice =
                    Number(item.TailorPillowPrice || 0);

                const tailorSmallPillowPrice =
                    Number(item.TailorSmallPillowPrice || 0);

                const tailorRollPillowPrice =
                    Number(item.TailorRollPillowPrice || 0);

                let tailorAmount = 0;

                // نوع تشک
                if (Number(item.Simple || 0) === 1) {
                    tailorAmount +=
                        mattressCount * tailorSimplePrice;
                }

                if (Number(item.SajafDar || 0) === 1) {
                    tailorAmount +=
                        mattressCount * tailorSajafDarPrice;
                }

                if (Number(item.Boxi || 0) === 1) {
                    tailorAmount +=
                        mattressCount * tailorBoxiPrice;
                }

                if (Number(item.DesignDar || 0) === 1) {
                    tailorAmount +=
                        mattressCount * tailorDesignDarPrice;
                }

                if (Number(item.ZirPoosh || 0) === 1) {
                    tailorAmount +=
                        mattressCount * tailorZirPooshPrice;
                }

                // بالشت
                tailorAmount +=
                    pillowCount * tailorPillowPrice;

                // بالشت کوچک
                tailorAmount +=
                    smallPillowCount * tailorSmallPillowPrice;

                // بالشت رول
                tailorAmount +=
                    rollPillowCount * tailorRollPillowPrice;

                // -------------------------------------------------
                // نرخ خیاط برای ثبت در ردیف
                // -------------------------------------------------
                // چون ممکن است چند نوع کار در یک ردیف باشد،
                // مبلغ واقعی در TailorAmount ذخیره می‌شود.
                //
                // TailorRate برای سازگاری با ساختار فعلی دیتابیس
                // میانگین وزنی نرخ‌های استفاده‌شده را نگه می‌دارد.
                // -------------------------------------------------

                const totalTailorUnits =
                    (Number(item.Simple || 0) * mattressCount) +
                    (Number(item.SajafDar || 0) * mattressCount) +
                    (Number(item.Boxi || 0) * mattressCount) +
                    (Number(item.DesignDar || 0) * mattressCount) +
                    (Number(item.ZirPoosh || 0) * mattressCount) +
                    pillowCount +
                    smallPillowCount +
                    rollPillowCount;

                const tailorRate =
                    totalTailorUnits > 0
                        ? tailorAmount / totalTailorUnits
                        : 0;

                request.input(
                    "TailorRate",
                    sql.Decimal(18, 2),
                    tailorRate
                );

                request.input(
                    "TailorAmount",
                    sql.Decimal(18, 2),
                    tailorAmount
                );

                // =================================================
                // INSERT تشک
                // =================================================

                await request.query(`
                    INSERT INTO MattressItems
                    (
                        BillId,
                        TailorId,
                        Simple,
                        SajafDar,
                        Boxi,
                        DesignDar,
                        ZirPoosh,
                        MattressCount,
                        PillowCount,
                        SmallPillowCount,
                        RollPillowCount,
                        FabricMeters,
                        FabricPrice,
                        SewingPrice,
                        TailorRate,
                        TailorAmount
                    )
                    VALUES
                    (
                        @BillId,
                        @TailorId,
                        @Simple,
                        @SajafDar,
                        @Boxi,
                        @DesignDar,
                        @ZirPoosh,
                        @MattressCount,
                        @PillowCount,
                        @SmallPillowCount,
                        @RollPillowCount,
                        @FabricMeters,
                        @FabricPrice,
                        @SewingPrice,
                        @TailorRate,
                        @TailorAmount
                    )
                `);
            }
        }

        // =================================================
        // ثبت پرده و جالی
        // =================================================

        if (Array.isArray(curtainItems)) {

            for (const item of curtainItems) {

                const request = new sql.Request(transaction);

                request.input(
                    "BillId",
                    sql.Int,
                    bill.Id
                );

                request.input(
                    "TailorId",
                    sql.Int,
                    item.TailorId || null
                );

                request.input(
                    "Ringdar",
                    sql.Int,
                    Number(item.Ringdar || 0)
                );

                request.input(
                    "Plyti",
                    sql.Int,
                    Number(item.Plyti || 0)
                );

                request.input(
                    "SePlyte",
                    sql.Int,
                    Number(item.SePlyte || 0)
                );

                request.input(
                    "Minimal",
                    sql.Int,
                    Number(item.Minimal || 0)
                );

                request.input(
                    "Iranian",
                    sql.Int,
                    Number(item.Iranian || 0)
                );

                request.input(
                    "PoshtPardeyi",
                    sql.Int,
                    Number(item.PoshtPardeyi || 0)
                );

                request.input(
                    "JaliMeters",
                    sql.Decimal(18, 2),
                    Number(item.JaliMeters || 0)
                );

                request.input(
                    "JaliPrice",
                    sql.Decimal(18, 2),
                    Number(item.JaliPrice || 0)
                );

                request.input(
                    "FabricMeters",
                    sql.Decimal(18, 2),
                    Number(item.FabricMeters || 0)
                );

                request.input(
                    "FabricPrice",
                    sql.Decimal(18, 2),
                    Number(item.FabricPrice || 0)
                );

                request.input(
                    "SewingPrice",
                    sql.Decimal(18, 2),
                    Number(item.SewingPrice || 0)
                );

                // =================================================
                // دستمزد خیاط پرده
                // =================================================

                const jaliMeters =
                    Number(item.JaliMeters || 0);

                const fabricMeters =
                    Number(item.FabricMeters || 0);

                const tailorRate =
                    Number(
                        item.TailorSewingPrice ||
                        item.TailorRate ||
                        0
                    );

                const tailorAmount =
                    (jaliMeters + fabricMeters) * tailorRate;

                request.input(
                    "TailorRate",
                    sql.Decimal(18, 2),
                    tailorRate
                );

                request.input(
                    "TailorAmount",
                    sql.Decimal(18, 2),
                    tailorAmount
                );

                // =================================================
                // INSERT پرده
                // =================================================

                await request.query(`
                    INSERT INTO CurtainItems
                    (
                        BillId,
                        TailorId,
                        Ringdar,
                        Plyti,
                        SePlyte,
                        Minimal,
                        Iranian,
                        PoshtPardeyi,
                        JaliMeters,
                        JaliPrice,
                        FabricMeters,
                        FabricPrice,
                        SewingPrice,
                        TailorRate,
                        TailorAmount
                    )
                    VALUES
                    (
                        @BillId,
                        @TailorId,
                        @Ringdar,
                        @Plyti,
                        @SePlyte,
                        @Minimal,
                        @Iranian,
                        @PoshtPardeyi,
                        @JaliMeters,
                        @JaliPrice,
                        @FabricMeters,
                        @FabricPrice,
                        @SewingPrice,
                        @TailorRate,
                        @TailorAmount
                    )
                `);
            }
        }

        // =================================================
        // ثبت رسید مشتری
        // =================================================

        if (receipt > 0) {

            const paymentRequest =
                new sql.Request(transaction);

            paymentRequest.input(
                "BillId",
                sql.Int,
                bill.Id
            );

            paymentRequest.input(
                "Amount",
                sql.Decimal(18, 2),
                receipt
            );

            paymentRequest.input(
                "PaymentDate",
                sql.Date,
                PaymentDate || BillDate
            );

            paymentRequest.input(
                "Description",
                sql.NVarChar(500),
                PaymentDescription || null
            );

            await paymentRequest.query(`
                INSERT INTO Payments
                (
                    BillId,
                    Amount,
                    PaymentDate,
                    Description
                )
                VALUES
                (
                    @BillId,
                    @Amount,
                    @PaymentDate,
                    @Description
                )
            `);
        }

        // =================================================
        // پایان Transaction
        // =================================================

        await transaction.commit();

        res.status(201).json({

            message: "بل با موفقیت ثبت شد",

            bill: bill,

            receipt: receipt,

            balance: total - receipt
        });

    } catch (err) {

        try {
            await transaction.rollback();
        } catch (rollbackError) {
            console.error(
                "❌ Rollback error:",
                rollbackError
            );
        }

        console.error(
            "❌ Error adding bill:",
            err
        );

        res.status(500).json({

            error: "خطا در ثبت بل",

            details: err.message
        });
    }
});

// =========================================================
// نمایش جزئیات کامل یک بل
// =========================================================

app.get("/api/bills/:id", async (req, res) => {

    try {

        const billId = Number(req.params.id);

        if (!billId || billId <= 0) {
            return res.status(400).json({
                error: "شناسه بل نامعتبر است"
            });
        }

        const pool = await sql.connect(dbConfig);

        // =================================================
        // اطلاعات اصلی بل + مشتری
        // =================================================

        const billResult = await pool.request()
            .input("BillId", sql.Int, billId)
            .query(`
                SELECT
                    b.Id,
                    b.BillNumber,
                    b.CustomerId,
                    c.FullName AS CustomerName,
                    c.Phone,
                    c.Address,
                    b.BillDate,
                    b.DeliveryDate,
                    b.TotalAmount,

                    ISNULL(
                        (
                            SELECT SUM(p.Amount)
                            FROM Payments p
                            WHERE p.BillId = b.Id
                        ),
                        0
                    ) AS ReceiptAmount,

                    b.TotalAmount -
                    ISNULL(
                        (
                            SELECT SUM(p.Amount)
                            FROM Payments p
                            WHERE p.BillId = b.Id
                        ),
                        0
                    ) AS BalanceAmount,

                    b.CreatedAt

                FROM Bills b

                INNER JOIN Customers c
                    ON c.Id = b.CustomerId

                WHERE b.Id = @BillId
            `);

        if (billResult.recordset.length === 0) {

            return res.status(404).json({
                error: "بل پیدا نشد"
            });
        }

        // =================================================
        // تشک و بالشت
        // =================================================

        const mattressResult = await pool.request()
            .input("BillId", sql.Int, billId)
            .query(`
                SELECT
                    Id,
                    BillId,
                    TailorId,
                    Simple,
                    SajafDar,
                    Boxi,
                    DesignDar,
                    ZirPoosh,
                    MattressCount,
                    PillowCount,
                    SmallPillowCount,
                    RollPillowCount,
                    FabricMeters,
                    FabricPrice,
                    SewingPrice,
                    TailorRate,
                    TailorAmount,
                    CreatedAt

                FROM MattressItems

                WHERE BillId = @BillId

                ORDER BY Id ASC
            `);

        // =================================================
        // پرده و جالی
        // =================================================

        const curtainResult = await pool.request()
            .input("BillId", sql.Int, billId)
            .query(`
                SELECT
                    Id,
                    BillId,
                    TailorId,
                    Ringdar,
                    Plyti,
                    SePlyte,
                    Minimal,
                    Iranian,
                    PoshtPardeyi,
                    JaliMeters,
                    JaliPrice,
                    FabricMeters,
                    FabricPrice,
                    SewingPrice,
                    TailorRate,
                    TailorAmount,
                    CreatedAt

                FROM CurtainItems

                WHERE BillId = @BillId

                ORDER BY Id ASC
            `);

        // =================================================
        // رسیدها
        // =================================================

        const paymentsResult = await pool.request()
            .input("BillId", sql.Int, billId)
            .query(`
                SELECT
                    Id,
                    BillId,
                    Amount,
                    PaymentDate,
                    Description,
                    CreatedAt

                FROM Payments

                WHERE BillId = @BillId

                ORDER BY PaymentDate ASC, Id ASC
            `);

        // =================================================
        // مجموع دستمزد خیاط
        // =================================================

        const tailorResult = await pool.request()
            .input("BillId", sql.Int, billId)
            .query(`
                SELECT
                    ISNULL(
                        (
                            SELECT SUM(TailorAmount)
                            FROM MattressItems
                            WHERE BillId = @BillId
                        ),
                        0
                    )
                    +
                    ISNULL(
                        (
                            SELECT SUM(TailorAmount)
                            FROM CurtainItems
                            WHERE BillId = @BillId
                        ),
                        0
                    ) AS TailorTotalAmount
            `);

        res.json({

            bill: billResult.recordset[0],

            mattressItems:
                mattressResult.recordset,

            curtainItems:
                curtainResult.recordset,

            payments:
                paymentsResult.recordset,

            tailorTotal:
                Number(
                    tailorResult.recordset[0]
                        .TailorTotalAmount || 0
                )
        });

    } catch (err) {

        console.error(
            "❌ Error getting bill details:",
            err
        );

        res.status(500).json({

            error: "خطا در دریافت جزئیات بل",

            details: err.message
        });
    }
});

// =========================================================
// حساب مشتری
// =========================================================

app.get("/api/customers/:id/account", async (req, res) => {

    try {

        const customerId =
            Number(req.params.id);

        if (!customerId || customerId <= 0) {

            return res.status(400).json({
                error: "شناسه مشتری نامعتبر است"
            });
        }

        const pool =
            await sql.connect(dbConfig);

        // =================================================
        // اطلاعات مشتری
        // =================================================

        const customerResult =
            await pool.request()
                .input(
                    "CustomerId",
                    sql.Int,
                    customerId
                )
                .query(`
                    SELECT
                        Id,
                        FullName,
                        Phone,
                        Address,
                        CreatedAt
                    FROM Customers
                    WHERE Id = @CustomerId
                `);

        if (customerResult.recordset.length === 0) {

            return res.status(404).json({
                error: "مشتری پیدا نشد"
            });
        }

        // =================================================
        // بل‌های مشتری
        // =================================================

        const billsResult =
            await pool.request()
                .input(
                    "CustomerId",
                    sql.Int,
                    customerId
                )
                .query(`
                    SELECT
                        b.Id,
                        b.BillNumber,
                        b.BillDate,
                        b.DeliveryDate,
                        b.TotalAmount,

                        ISNULL(
                            (
                                SELECT SUM(p.Amount)
                                FROM Payments p
                                WHERE p.BillId = b.Id
                            ),
                            0
                        ) AS ReceiptAmount,

                        b.TotalAmount -
                        ISNULL(
                            (
                                SELECT SUM(p.Amount)
                                FROM Payments p
                                WHERE p.BillId = b.Id
                            ),
                            0
                        ) AS BalanceAmount

                    FROM Bills b

                    WHERE b.CustomerId = @CustomerId

                    ORDER BY b.Id DESC
                `);

        const bills =
            billsResult.recordset;

        // =================================================
        // محاسبه مجموع حساب
        // =================================================

        let totalAmount = 0;
        let totalReceipt = 0;
        let totalBalance = 0;

        bills.forEach(bill => {

            totalAmount +=
                Number(bill.TotalAmount || 0);

            totalReceipt +=
                Number(bill.ReceiptAmount || 0);

            totalBalance +=
                Number(bill.BalanceAmount || 0);
        });

        res.json({

            customer:
                customerResult.recordset[0],

            summary: {

                TotalAmount:
                    totalAmount,

                ReceiptAmount:
                    totalReceipt,

                BalanceAmount:
                    totalBalance
            },

            bills:
                bills
        });

    } catch (err) {

        console.error(
            "❌ Error getting customer account:",
            err
        );

        res.status(500).json({

            error: "خطا در دریافت حساب مشتری",

            details: err.message
        });
    }
});

// =========================================================
// نمایش و جستجوی بل‌ها
// =========================================================

app.get("/api/bills", async (req, res) => {

    try {

        const {
            billNumber,
            customerName,
            phone,
            date
        } = req.query;

        const pool =
            await sql.connect(dbConfig);

        let query = `

            SELECT
                b.Id,
                b.BillNumber,
                c.FullName AS CustomerName,
                c.Phone,
                b.BillDate,
                b.DeliveryDate,
                b.TotalAmount,

                ISNULL(
                    (
                        SELECT SUM(p.Amount)
                        FROM Payments p
                        WHERE p.BillId = b.Id
                    ),
                    0
                ) AS ReceiptAmount,

                b.TotalAmount -
                ISNULL(
                    (
                        SELECT SUM(p.Amount)
                        FROM Payments p
                        WHERE p.BillId = b.Id
                    ),
                    0
                ) AS BalanceAmount

            FROM Bills b

            INNER JOIN Customers c
                ON c.Id = b.CustomerId

            WHERE 1 = 1
        `;

        const request =
            pool.request();

        // شماره بل
        if (billNumber) {

            query += `
                AND b.BillNumber = @BillNumber
            `;

            request.input(
                "BillNumber",
                sql.Int,
                Number(billNumber)
            );
        }

        // نام مشتری
        if (customerName) {

            query += `
                AND c.FullName LIKE @CustomerName
            `;

            request.input(
                "CustomerName",
                sql.NVarChar,
                `%${customerName}%`
            );
        }

        // شماره تلفن
        if (phone) {

            query += `
                AND c.Phone LIKE @Phone
            `;

            request.input(
                "Phone",
                sql.NVarChar,
                `%${phone}%`
            );
        }

        // تاریخ
        if (date) {

            query += `
                AND b.BillDate = @BillDate
            `;

            request.input(
                "BillDate",
                sql.Date,
                date
            );
        }

        query += `
            ORDER BY b.Id DESC
        `;

        const result =
            await request.query(query);

        res.json(
            result.recordset
        );

    } catch (err) {

        console.error(
            "❌ خطا در نمایش بل‌ها:",
            err
        );

        res.status(500).json({

            error: "خطا در نمایش بل‌ها",

            details: err.message
        });
    }
});

// =====================================================
// شروع سرور
// =====================================================

// =========================================================
// حساب خیاط
// =========================================================

// =========================================================
// حساب خیاط - با فیلتر ماه
// =========================================================

app.get('/api/tailor/account', async (req, res) => {

    try {

        const { month } = req.query;

        const pool = await sql.connect(dbConfig);

        let dateCondition = '';
        let monthParams = {};

        /*
         * اگر ماه انتخاب شده باشد:
         * مثال: 2026-09
         */

        if (month) {

            const parts = month.split('-');

            if (
                parts.length !== 2 ||
                !/^\d{4}$/.test(parts[0]) ||
                !/^\d{2}$/.test(parts[1])
            ) {

                return res.status(400).json({
                    error: 'فرمت ماه نامعتبر است.'
                });

            }

            const year = Number(parts[0]);
            const monthNumber = Number(parts[1]);

            if (
                monthNumber < 1 ||
                monthNumber > 12
            ) {

                return res.status(400).json({
                    error: 'ماه نامعتبر است.'
                });

            }

            dateCondition = `
                AND YEAR(B.BillDate) = @Year
                AND MONTH(B.BillDate) = @Month
            `;

            monthParams = {
                year,
                monthNumber
            };

        }


        /*
         * مجموع دستمزد توشک
         */

        const mattressRequest =
            pool.request();

        if (month) {

            mattressRequest
                .input(
                    'Year',
                    sql.Int,
                    monthParams.year
                )
                .input(
                    'Month',
                    sql.Int,
                    monthParams.monthNumber
                );

        }

        const mattressSummary =
            await mattressRequest.query(`

                SELECT
                    ISNULL(
                        SUM(MI.TailorAmount),
                        0
                    ) AS MattressTailorAmount

                FROM MattressItems MI

                INNER JOIN Bills B
                    ON B.Id = MI.BillId

                WHERE 1 = 1

                ${dateCondition}

            `);


        /*
         * مجموع دستمزد پرده
         */

        const curtainRequest =
            pool.request();

        if (month) {

            curtainRequest
                .input(
                    'Year',
                    sql.Int,
                    monthParams.year
                )
                .input(
                    'Month',
                    sql.Int,
                    monthParams.monthNumber
                );

        }

        const curtainSummary =
            await curtainRequest.query(`

                SELECT
                    ISNULL(
                        SUM(CI.TailorAmount),
                        0
                    ) AS CurtainTailorAmount

                FROM CurtainItems CI

                INNER JOIN Bills B
                    ON B.Id = CI.BillId

                WHERE 1 = 1

                ${dateCondition}

            `);


        const MattressTailorAmount =
            Number(
                mattressSummary
                    .recordset[0]
                    .MattressTailorAmount || 0
            );


        const CurtainTailorAmount =
            Number(
                curtainSummary
                    .recordset[0]
                    .CurtainTailorAmount || 0
            );


        const TotalTailorAmount =
            MattressTailorAmount +
            CurtainTailorAmount;


        /*
         * جزئیات توشک
         */

        const mattressDetailsRequest =
            pool.request();

        if (month) {

            mattressDetailsRequest
                .input(
                    'Year',
                    sql.Int,
                    monthParams.year
                )
                .input(
                    'Month',
                    sql.Int,
                    monthParams.monthNumber
                );

        }

        const mattressDetails =
            await mattressDetailsRequest.query(`

                SELECT

                    MI.Id,
                    MI.BillId,

                    B.BillNumber,
                    B.BillDate,

                    C.FullName AS CustomerName,

                    MI.Simple,
                    MI.SajafDar,
                    MI.Boxi,
                    MI.DesignDar,
                    MI.ZirPoosh,

                    MI.MattressCount,
                    MI.PillowCount,
                    MI.SmallPillowCount,
                    MI.RollPillowCount,

                    MI.TailorRate,
                    MI.TailorAmount

                FROM MattressItems MI

                INNER JOIN Bills B
                    ON B.Id = MI.BillId

                LEFT JOIN Customers C
                    ON C.Id = B.CustomerId

                WHERE 1 = 1

                ${dateCondition}

                ORDER BY
                    B.BillDate DESC,
                    B.BillNumber DESC,
                    MI.Id DESC

            `);


        /*
         * جزئیات پرده
         */

        const curtainDetailsRequest =
            pool.request();

        if (month) {

            curtainDetailsRequest
                .input(
                    'Year',
                    sql.Int,
                    monthParams.year
                )
                .input(
                    'Month',
                    sql.Int,
                    monthParams.monthNumber
                );

        }

        const curtainDetails =
            await curtainDetailsRequest.query(`

                SELECT

                    CI.Id,
                    CI.BillId,

                    B.BillNumber,
                    B.BillDate,

                    C.FullName AS CustomerName,

                    CI.Ringdar,
                    CI.Plyti,
                    CI.SePlyte,
                    CI.Minimal,
                    CI.Iranian,
                    CI.PoshtPardeyi,

                    CI.JaliMeters,
                    CI.FabricMeters,

                    CI.TailorRate,
                    CI.TailorAmount

                FROM CurtainItems CI

                INNER JOIN Bills B
                    ON B.Id = CI.BillId

                LEFT JOIN Customers C
                    ON C.Id = B.CustomerId

                WHERE 1 = 1

                ${dateCondition}

                ORDER BY
                    B.BillDate DESC,
                    B.BillNumber DESC,
                    CI.Id DESC

            `);


        res.json({

            tailor: {
                Name: 'خیاط'
            },

            selectedMonth:
                month || null,

            summary: {

                MattressTailorAmount,

                CurtainTailorAmount,

                TotalTailorAmount

            },

            mattressDetails:
                mattressDetails.recordset,

            curtainDetails:
                curtainDetails.recordset

        });

    } catch (err) {

        console.error(
            '❌ Error getting tailor account:',
            err
        );

        res.status(500).json({
            error:
                'خطا در دریافت حساب خیاط'
        });

    }

});
// =========================================================
// پرداخت‌های خیاط
// =========================================================

// نمایش سابقه پرداخت‌های خیاط
// =========================================================
// پرداخت‌های خیاط - با فیلتر ماه
// =========================================================

app.get('/api/tailor/payments', async (req, res) => {

    try {

        const { month } = req.query;

        const pool = await sql.connect(dbConfig);

        const request =
            pool.request();

        let dateCondition = '';

        if (month) {

            const parts =
                month.split('-');

            if (
                parts.length !== 2 ||
                !/^\d{4}$/.test(parts[0]) ||
                !/^\d{2}$/.test(parts[1])
            ) {

                return res.status(400).json({
                    error:
                        'فرمت ماه نامعتبر است.'
                });

            }

            const year =
                Number(parts[0]);

            const monthNumber =
                Number(parts[1]);

            if (
                monthNumber < 1 ||
                monthNumber > 12
            ) {

                return res.status(400).json({
                    error:
                        'ماه نامعتبر است.'
                });

            }

            request
                .input(
                    'Year',
                    sql.Int,
                    year
                )
                .input(
                    'Month',
                    sql.Int,
                    monthNumber
                );

            dateCondition = `
                AND YEAR(P.PaymentDate) = @Year
                AND MONTH(P.PaymentDate) = @Month
            `;

        }

        const result =
            await request.query(`

                SELECT

                    P.Id,
                    P.TailorId,
                    P.Amount,
                    P.PaymentDate,
                    P.Description,
                    P.CreatedAt

                FROM TailorPayments P

                WHERE
                    P.TailorId = 1

                    ${dateCondition}

                ORDER BY
                    P.PaymentDate DESC,
                    P.Id DESC

            `);


        res.json(
            result.recordset
        );

    } catch (err) {

        console.error(
            '❌ Error getting tailor payments:',
            err
        );

        res.status(500).json({
            error:
                'خطا در دریافت پرداخت‌های خیاط'
        });

    }

});
// حذف پرداخت خیاط
app.delete('/api/tailor/payments/:id', async (req, res) => {

    try {

        const id = Number(req.params.id);

        if (!id) {
            return res.status(400).json({
                error: 'شناسه پرداخت نامعتبر است.'
            });
        }

        const pool = await sql.connect(dbConfig);

        await pool.request()
            .input('Id', sql.Int, id)
            .query(`
                DELETE FROM TailorPayments
                WHERE Id = @Id
                AND TailorId = 1
            `);

        res.json({
            success: true,
            message: 'پرداخت حذف شد ✅'
        });

    } catch (err) {

        console.error('❌ Error deleting tailor payment:', err);

        res.status(500).json({
            error: 'خطا در حذف پرداخت'
        });

    }
});
// =========================================================
// مدیریت رسیدهای مشتری
// =========================================================


// =========================================================
// نمایش تمام رسیدهای یک مشتری
// =========================================================

app.get(
    "/api/customers/:id/payments",
    async (req, res) => {

        try {

            const customerId =
                Number(req.params.id);


            if (!customerId || customerId <= 0) {

                return res.status(400).json({
                    error:
                        "شناسه مشتری نامعتبر است"
                });

            }


            const pool =
                await sql.connect(dbConfig);


            const result =
                await pool.request()

                    .input(
                        "CustomerId",
                        sql.Int,
                        customerId
                    )

                    .query(`
                        SELECT

                            p.Id,
                            p.BillId,
                            b.BillNumber,
                            b.CustomerId,
                            p.Amount,
                            p.PaymentDate,
                            p.Description,
                            p.CreatedAt

                        FROM Payments p

                        INNER JOIN Bills b
                            ON b.Id = p.BillId

                        WHERE
                            b.CustomerId = @CustomerId

                        ORDER BY
                            p.PaymentDate DESC,
                            p.Id DESC
                    `);


            res.json(
                result.recordset
            );


        } catch (err) {

            console.error(
                "❌ Error getting customer payments:",
                err
            );


            res.status(500).json({

                error:
                    "خطا در دریافت رسیدهای مشتری",

                details:
                    err.message

            });

        }

    }
);


// =========================================================
// ثبت رسید جدید برای مشتری
// =========================================================

app.post(
    "/api/customers/:id/payments",
    async (req, res) => {

        try {

            const customerId =
                Number(req.params.id);


            const {
                BillId,
                Amount,
                PaymentDate,
                Description
            } = req.body;


            if (
                !customerId ||
                customerId <= 0
            ) {

                return res.status(400).json({

                    error:
                        "شناسه مشتری نامعتبر است"

                });

            }


            const billId =
                Number(BillId);


            const amount =
                Number(Amount);


            if (
                !billId ||
                billId <= 0
            ) {

                return res.status(400).json({

                    error:
                        "بل را انتخاب کنید"

                });

            }


            if (
                !amount ||
                amount <= 0
            ) {

                return res.status(400).json({

                    error:
                        "مبلغ رسید باید بیشتر از صفر باشد"

                });

            }


            if (!PaymentDate) {

                return res.status(400).json({

                    error:
                        "تاریخ رسید الزامی است"

                });

            }


            const pool =
                await sql.connect(dbConfig);


            // -----------------------------------------
            // بررسی اینکه بل مربوط به همین مشتری باشد
            // -----------------------------------------

            const billCheck =
                await pool.request()

                    .input(
                        "BillId",
                        sql.Int,
                        billId
                    )

                    .input(
                        "CustomerId",
                        sql.Int,
                        customerId
                    )

                    .query(`

                        SELECT
                            Id,
                            BillNumber,
                            TotalAmount

                        FROM Bills

                        WHERE
                            Id = @BillId

                            AND CustomerId =
                                @CustomerId

                    `);


            if (
                billCheck.recordset.length === 0
            ) {

                return res.status(404).json({

                    error:
                        "بل مربوط به این مشتری پیدا نشد"

                });

            }


            // -----------------------------------------
            // ثبت رسید
            // -----------------------------------------

            const result =
                await pool.request()

                    .input(
                        "BillId",
                        sql.Int,
                        billId
                    )

                    .input(
                        "Amount",
                        sql.Decimal(18, 2),
                        amount
                    )

                    .input(
                        "PaymentDate",
                        sql.Date,
                        PaymentDate
                    )

                    .input(
                        "Description",
                        sql.NVarChar(500),
                        Description || null
                    )

                    .query(`

                        INSERT INTO Payments
                        (
                            BillId,
                            Amount,
                            PaymentDate,
                            Description
                        )

                        OUTPUT
                            INSERTED.Id,
                            INSERTED.BillId,
                            INSERTED.Amount,
                            INSERTED.PaymentDate,
                            INSERTED.Description,
                            INSERTED.CreatedAt

                        VALUES
                        (
                            @BillId,
                            @Amount,
                            @PaymentDate,
                            @Description
                        )

                    `);


            res.status(201).json({

                success:
                    true,

                message:
                    "رسید با موفقیت ثبت شد ✅",

                payment:
                    result.recordset[0]

            });


        } catch (err) {

            console.error(
                "❌ Error adding customer payment:",
                err
            );


            res.status(500).json({

                error:
                    "خطا در ثبت رسید مشتری",

                details:
                    err.message

            });

        }

    }
);


// =========================================================
// ویرایش رسید مشتری
// =========================================================

app.put(
    "/api/customers/:customerId/payments/:paymentId",
    async (req, res) => {

        try {

            const customerId =
                Number(
                    req.params.customerId
                );


            const paymentId =
                Number(
                    req.params.paymentId
                );


            const {
                BillId,
                Amount,
                PaymentDate,
                Description
            } = req.body;


            if (
                !customerId ||
                customerId <= 0
            ) {

                return res.status(400).json({

                    error:
                        "شناسه مشتری نامعتبر است"

                });

            }


            if (
                !paymentId ||
                paymentId <= 0
            ) {

                return res.status(400).json({

                    error:
                        "شناسه رسید نامعتبر است"

                });

            }


            const billId =
                Number(BillId);


            const amount =
                Number(Amount);


            if (
                !billId ||
                billId <= 0
            ) {

                return res.status(400).json({

                    error:
                        "بل را انتخاب کنید"

                });

            }


            if (
                !amount ||
                amount <= 0
            ) {

                return res.status(400).json({

                    error:
                        "مبلغ رسید باید بیشتر از صفر باشد"

                });

            }


            if (!PaymentDate) {

                return res.status(400).json({

                    error:
                        "تاریخ رسید الزامی است"

                });

            }


            const pool =
                await sql.connect(dbConfig);


            // -----------------------------------------
            // بررسی رسید و مالکیت آن
            // -----------------------------------------

            const paymentCheck =
                await pool.request()

                    .input(
                        "PaymentId",
                        sql.Int,
                        paymentId
                    )

                    .input(
                        "CustomerId",
                        sql.Int,
                        customerId
                    )

                    .query(`

                        SELECT

                            p.Id,
                            p.BillId

                        FROM Payments p

                        INNER JOIN Bills b
                            ON b.Id = p.BillId

                        WHERE
                            p.Id = @PaymentId

                            AND b.CustomerId =
                                @CustomerId

                    `);


            if (
                paymentCheck.recordset.length === 0
            ) {

                return res.status(404).json({

                    error:
                        "رسید مورد نظر پیدا نشد"

                });

            }


            // -----------------------------------------
            // بررسی بل جدید
            // -----------------------------------------

            const billCheck =
                await pool.request()

                    .input(
                        "BillId",
                        sql.Int,
                        billId
                    )

                    .input(
                        "CustomerId",
                        sql.Int,
                        customerId
                    )

                    .query(`

                        SELECT
                            Id

                        FROM Bills

                        WHERE
                            Id = @BillId

                            AND CustomerId =
                                @CustomerId

                    `);


            if (
                billCheck.recordset.length === 0
            ) {

                return res.status(404).json({

                    error:
                        "بل مربوط به این مشتری پیدا نشد"

                });

            }


            // -----------------------------------------
            // ویرایش
            // -----------------------------------------

            const result =
                await pool.request()

                    .input(
                        "PaymentId",
                        sql.Int,
                        paymentId
                    )

                    .input(
                        "BillId",
                        sql.Int,
                        billId
                    )

                    .input(
                        "Amount",
                        sql.Decimal(18, 2),
                        amount
                    )

                    .input(
                        "PaymentDate",
                        sql.Date,
                        PaymentDate
                    )

                    .input(
                        "Description",
                        sql.NVarChar(500),
                        Description || null
                    )

                    .query(`

                        UPDATE Payments

                        SET

                            BillId =
                                @BillId,

                            Amount =
                                @Amount,

                            PaymentDate =
                                @PaymentDate,

                            Description =
                                @Description

                        OUTPUT
                            INSERTED.Id,
                            INSERTED.BillId,
                            INSERTED.Amount,
                            INSERTED.PaymentDate,
                            INSERTED.Description,
                            INSERTED.CreatedAt

                        WHERE
                            Id = @PaymentId

                    `);


            res.json({

                success:
                    true,

                message:
                    "رسید با موفقیت ویرایش شد ✅",

                payment:
                    result.recordset[0]

            });


        } catch (err) {

            console.error(
                "❌ Error editing customer payment:",
                err
            );


            res.status(500).json({

                error:
                    "خطا در ویرایش رسید مشتری",

                details:
                    err.message

            });

        }

    }
);


// =========================================================
// حذف رسید مشتری
// =========================================================

app.delete(
    "/api/customers/:customerId/payments/:paymentId",
    async (req, res) => {

        try {

            const customerId =
                Number(
                    req.params.customerId
                );


            const paymentId =
                Number(
                    req.params.paymentId
                );


            if (
                !customerId ||
                customerId <= 0
            ) {

                return res.status(400).json({

                    error:
                        "شناسه مشتری نامعتبر است"

                });

            }


            if (
                !paymentId ||
                paymentId <= 0
            ) {

                return res.status(400).json({

                    error:
                        "شناسه رسید نامعتبر است"

                });

            }


            const pool =
                await sql.connect(dbConfig);


            // -----------------------------------------
            // بررسی مالکیت رسید
            // -----------------------------------------

            const check =
                await pool.request()

                    .input(
                        "PaymentId",
                        sql.Int,
                        paymentId
                    )

                    .input(
                        "CustomerId",
                        sql.Int,
                        customerId
                    )

                    .query(`

                        SELECT
                            p.Id

                        FROM Payments p

                        INNER JOIN Bills b
                            ON b.Id = p.BillId

                        WHERE
                            p.Id = @PaymentId

                            AND b.CustomerId =
                                @CustomerId

                    `);


            if (
                check.recordset.length === 0
            ) {

                return res.status(404).json({

                    error:
                        "رسید مورد نظر پیدا نشد"

                });

            }


            // -----------------------------------------
            // حذف
            // -----------------------------------------

            await pool.request()

                .input(
                    "PaymentId",
                    sql.Int,
                    paymentId
                )

                .query(`

                    DELETE FROM Payments

                    WHERE
                        Id = @PaymentId

                `);


            res.json({

                success:
                    true,

                message:
                    "رسید با موفقیت حذف شد ✅"

            });


        } catch (err) {

            console.error(
                "❌ Error deleting customer payment:",
                err
            );


            res.status(500).json({

                error:
                    "خطا در حذف رسید مشتری",

                details:
                    err.message

            });

        }

    }
);

// =========================================================
// ویرایش مصرف
// =========================================================

app.put("/api/expenses/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);

        const {
            ExpenseType,
            Amount,
            ExpenseDate,
            Description
        } = req.body;

        if (!id || id <= 0) {
            return res.status(400).json({
                error: "شناسه مصرف نامعتبر است"
            });
        }

        if (!ExpenseType || Amount === undefined || !ExpenseDate) {
            return res.status(400).json({
                error: "اطلاعات مصرف کامل نیست"
            });
        }

        const pool = await sql.connect(dbConfig);

        const result = await pool.request()
            .input("Id", sql.Int, id)
            .input("ExpenseType", sql.NVarChar(255), ExpenseType)
            .input("Amount", sql.Decimal(18, 2), Number(Amount))
            .input("ExpenseDate", sql.Date, ExpenseDate)
            .input(
                "Description",
                sql.NVarChar(1000),
                Description || ""
            )
            .query(`
                UPDATE Expenses
                SET
                    ExpenseType = @ExpenseType,
                    Amount = @Amount,
                    ExpenseDate = @ExpenseDate,
                    Description = @Description
                OUTPUT
                    INSERTED.Id,
                    INSERTED.ExpenseType,
                    INSERTED.Amount,
                    INSERTED.ExpenseDate,
                    INSERTED.Description,
                    INSERTED.CreatedAt
                WHERE Id = @Id
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({
                error: "مصرف مورد نظر پیدا نشد"
            });
        }

        res.json({
            success: true,
            message: "مصرف با موفقیت ویرایش شد ✅",
            expense: result.recordset[0]
        });

    } catch (err) {
        console.error("❌ Error editing expense:", err);

        res.status(500).json({
            error: "خطا در ویرایش مصرف",
            details: err.message
        });
    }
});


// =========================================================
// حذف مصرف
// =========================================================

app.delete("/api/expenses/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!id || id <= 0) {
            return res.status(400).json({
                error: "شناسه مصرف نامعتبر است"
            });
        }

        const pool = await sql.connect(dbConfig);

        const result = await pool.request()
            .input("Id", sql.Int, id)
            .query(`
                DELETE FROM Expenses
                WHERE Id = @Id
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({
                error: "مصرف مورد نظر پیدا نشد"
            });
        }

        res.json({
            success: true,
            message: "مصرف با موفقیت حذف شد ✅"
        });

    } catch (err) {
        console.error("❌ Error deleting expense:", err);

        res.status(500).json({
            error: "خطا در حذف مصرف",
            details: err.message
        });
    }
});
app.get("/api/expenses", async (req, res) => {
    try {
        const { month } = req.query;

        const pool = await sql.connect(dbConfig);

        let query = `
            SELECT
                Id,
                ExpenseType,
                Amount,
                ExpenseDate,
                Description,
                CreatedAt
            FROM Expenses
        `;

        const request = pool.request();

        if (month) {
            query += `
                WHERE CONVERT(char(7), ExpenseDate, 120) = @Month
            `;

            request.input("Month", sql.VarChar(7), month);
        }

        query += `
            ORDER BY ExpenseDate DESC, Id DESC
        `;

        const result = await request.query(query);

        const total = result.recordset.reduce(
            (sum, item) => sum + Number(item.Amount || 0),
            0
        );

        res.json({
            success: true,
            expenses: result.recordset,
            total: total
        });

    } catch (err) {
        console.error("❌ Error getting expenses:", err);

        res.status(500).json({
            error: "خطا در دریافت مصارف",
            details: err.message
        });
    }
});


// ---------------------------------------------------------
// ثبت مصرف
// ---------------------------------------------------------

app.post("/api/expenses", async (req, res) => {
    try {
        const {
            ExpenseType,
            Amount,
            ExpenseDate,
            Description
        } = req.body;

        if (!ExpenseType || Amount === undefined || !ExpenseDate) {
            return res.status(400).json({
                error: "اطلاعات مصرف کامل نیست"
            });
        }

        const amount = Number(Amount);

        if (isNaN(amount) || amount <= 0) {
            return res.status(400).json({
                error: "مبلغ مصرف نامعتبر است"
            });
        }

        const pool = await sql.connect(dbConfig);

        const result = await pool.request()
            .input(
                "ExpenseType",
                sql.NVarChar(255),
                ExpenseType
            )
            .input(
                "Amount",
                sql.Decimal(18, 2),
                amount
            )
            .input(
                "ExpenseDate",
                sql.Date,
                ExpenseDate
            )
            .input(
                "Description",
                sql.NVarChar(1000),
                Description || ""
            )
            .query(`
                INSERT INTO Expenses
                (
                    ExpenseType,
                    Amount,
                    ExpenseDate,
                    Description,
                    CreatedAt
                )
                OUTPUT
                    INSERTED.Id,
                    INSERTED.ExpenseType,
                    INSERTED.Amount,
                    INSERTED.ExpenseDate,
                    INSERTED.Description,
                    INSERTED.CreatedAt
                VALUES
                (
                    @ExpenseType,
                    @Amount,
                    @ExpenseDate,
                    @Description,
                    GETDATE()
                )
            `);

        res.status(201).json({
            success: true,
            message: "مصرف با موفقیت ثبت شد ✅",
            expense: result.recordset[0]
        });

    } catch (err) {
        console.error("❌ Error adding expense:", err);

        res.status(500).json({
            error: "خطا در ثبت مصرف",
            details: err.message
        });
    }
});


// ---------------------------------------------------------
// ویرایش مصرف
// ---------------------------------------------------------

app.put("/api/expenses/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);

        const {
            ExpenseType,
            Amount,
            ExpenseDate,
            Description
        } = req.body;

        if (!id || id <= 0) {
            return res.status(400).json({
                error: "شناسه مصرف نامعتبر است"
            });
        }

        if (!ExpenseType || Amount === undefined || !ExpenseDate) {
            return res.status(400).json({
                error: "اطلاعات مصرف کامل نیست"
            });
        }

        const amount = Number(Amount);

        if (isNaN(amount) || amount <= 0) {
            return res.status(400).json({
                error: "مبلغ مصرف نامعتبر است"
            });
        }

        const pool = await sql.connect(dbConfig);

        const result = await pool.request()
            .input("Id", sql.Int, id)
            .input(
                "ExpenseType",
                sql.NVarChar(255),
                ExpenseType
            )
            .input(
                "Amount",
                sql.Decimal(18, 2),
                amount
            )
            .input(
                "ExpenseDate",
                sql.Date,
                ExpenseDate
            )
            .input(
                "Description",
                sql.NVarChar(1000),
                Description || ""
            )
            .query(`
                UPDATE Expenses
                SET
                    ExpenseType = @ExpenseType,
                    Amount = @Amount,
                    ExpenseDate = @ExpenseDate,
                    Description = @Description
                OUTPUT
                    INSERTED.Id,
                    INSERTED.ExpenseType,
                    INSERTED.Amount,
                    INSERTED.ExpenseDate,
                    INSERTED.Description,
                    INSERTED.CreatedAt
                WHERE Id = @Id
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({
                error: "مصرف مورد نظر پیدا نشد"
            });
        }

        res.json({
            success: true,
            message: "مصرف با موفقیت ویرایش شد ✅",
            expense: result.recordset[0]
        });

    } catch (err) {
        console.error("❌ Error editing expense:", err);

        res.status(500).json({
            error: "خطا در ویرایش مصرف",
            details: err.message
        });
    }
});


// ---------------------------------------------------------
// حذف مصرف
// ---------------------------------------------------------

app.delete("/api/expenses/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!id || id <= 0) {
            return res.status(400).json({
                error: "شناسه مصرف نامعتبر است"
            });
        }

        const pool = await sql.connect(dbConfig);

        const result = await pool.request()
            .input("Id", sql.Int, id)
            .query(`
                DELETE FROM Expenses
                WHERE Id = @Id
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({
                error: "مصرف مورد نظر پیدا نشد"
            });
        }

        res.json({
            success: true,
            message: "مصرف با موفقیت حذف شد ✅"
        });

    } catch (err) {
        console.error("❌ Error deleting expense:", err);

        res.status(500).json({
            error: "خطا در حذف مصرف",
            details: err.message
        });
    }
});

// API کارمندان
// =========================================================

// ---------------------------------------------------------
// دریافت لیست کارمندان
// ---------------------------------------------------------

app.get("/api/employees", async (req, res) => {

    try {

        const pool = await sql.connect(dbConfig);

        const result = await pool.request().query(`

            SELECT
                Id,
                FullName,
                Phone,
                Position,
                Salary,
                HireDate,
                IsActive,
                CreatedAt

            FROM Employees

            ORDER BY Id DESC

        `);

        res.json(result.recordset);

    } catch (err) {

        console.error("❌ Error getting employees:", err);

        res.status(500).json({
            error: "خطا در دریافت کارمندان",
            details: err.message
        });

    }

});


// ---------------------------------------------------------
// ثبت کارمند جدید
// ---------------------------------------------------------

app.post("/api/employees", async (req, res) => {

    try {

        const {
            FullName,
            Phone,
            Position,
            Salary,
            HireDate,
            IsActive
        } = req.body;


        if (!FullName || !FullName.trim()) {

            return res.status(400).json({
                error: "نام کارمند الزامی است"
            });

        }


        const pool = await sql.connect(dbConfig);


        const result = await pool.request()

            .input(
                "FullName",
                sql.NVarChar(200),
                FullName.trim()
            )

            .input(
                "Phone",
                sql.NVarChar(50),
                Phone || null
            )

            .input(
                "Position",
                sql.NVarChar(100),
                Position || null
            )

            .input(
                "Salary",
                sql.Decimal(18, 2),
                Number(Salary) || 0
            )

            .input(
                "HireDate",
                sql.Date,
                HireDate || null
            )

            .input(
                "IsActive",
                sql.Bit,
                IsActive === false ? 0 : 1
            )

            .query(`

                INSERT INTO Employees
                (
                    FullName,
                    Phone,
                    Position,
                    Salary,
                    HireDate,
                    IsActive,
                    CreatedAt
                )

                OUTPUT
                    INSERTED.Id,
                    INSERTED.FullName,
                    INSERTED.Phone,
                    INSERTED.Position,
                    INSERTED.Salary,
                    INSERTED.HireDate,
                    INSERTED.IsActive,
                    INSERTED.CreatedAt

                VALUES
                (
                    @FullName,
                    @Phone,
                    @Position,
                    @Salary,
                    @HireDate,
                    @IsActive,
                    SYSDATETIME()
                )

            `);


        res.status(201).json({

            success: true,

            message: "کارمند با موفقیت ثبت شد ✅",

            employee: result.recordset[0]

        });


    } catch (err) {

        console.error("❌ Error adding employee:", err);

        res.status(500).json({

            error: "خطا در ثبت کارمند",

            details: err.message

        });

    }

});


// ---------------------------------------------------------
// ویرایش کارمند
// ---------------------------------------------------------

app.put("/api/employees/:id", async (req, res) => {

    try {

        const id = Number(req.params.id);


        if (!id || id <= 0) {

            return res.status(400).json({
                error: "شناسه کارمند نامعتبر است"
            });

        }


        const {
            FullName,
            Phone,
            Position,
            Salary,
            HireDate,
            IsActive
        } = req.body;


        if (!FullName || !FullName.trim()) {

            return res.status(400).json({
                error: "نام کارمند الزامی است"
            });

        }


        const pool = await sql.connect(dbConfig);


        const result = await pool.request()

            .input(
                "Id",
                sql.Int,
                id
            )

            .input(
                "FullName",
                sql.NVarChar(200),
                FullName.trim()
            )

            .input(
                "Phone",
                sql.NVarChar(50),
                Phone || null
            )

            .input(
                "Position",
                sql.NVarChar(100),
                Position || null
            )

            .input(
                "Salary",
                sql.Decimal(18, 2),
                Number(Salary) || 0
            )

            .input(
                "HireDate",
                sql.Date,
                HireDate || null
            )

            .input(
                "IsActive",
                sql.Bit,
                IsActive === false ? 0 : 1
            )

            .query(`

                UPDATE Employees

                SET
                    FullName = @FullName,
                    Phone = @Phone,
                    Position = @Position,
                    Salary = @Salary,
                    HireDate = @HireDate,
                    IsActive = @IsActive

                OUTPUT
                    INSERTED.Id,
                    INSERTED.FullName,
                    INSERTED.Phone,
                    INSERTED.Position,
                    INSERTED.Salary,
                    INSERTED.HireDate,
                    INSERTED.IsActive,
                    INSERTED.CreatedAt

                WHERE Id = @Id

            `);


        if (result.recordset.length === 0) {

            return res.status(404).json({
                error: "کارمند پیدا نشد"
            });

        }


        res.json({

            success: true,

            message: "اطلاعات کارمند با موفقیت ویرایش شد ✅",

            employee: result.recordset[0]

        });


    } catch (err) {

        console.error("❌ Error editing employee:", err);

        res.status(500).json({

            error: "خطا در ویرایش کارمند",

            details: err.message

        });

    }

});


// ---------------------------------------------------------
// حذف کارمند
// ---------------------------------------------------------

app.delete("/api/employees/:id", async (req, res) => {

    try {

        const id = Number(req.params.id);


        if (!id || id <= 0) {

            return res.status(400).json({
                error: "شناسه کارمند نامعتبر است"
            });

        }


        const pool = await sql.connect(dbConfig);


        const result = await pool.request()

            .input(
                "Id",
                sql.Int,
                id
            )

            .query(`

                DELETE FROM Employees

                WHERE Id = @Id

            `);


        if (result.rowsAffected[0] === 0) {

            return res.status(404).json({
                error: "کارمند پیدا نشد"
            });

        }


        res.json({

            success: true,

            message: "کارمند با موفقیت حذف شد ✅"

        });


    } catch (err) {

        console.error("❌ Error deleting employee:", err);

        res.status(500).json({

            error: "خطا در حذف کارمند",

            details: err.message

        });

    }

});
// =========================================================
// API پرداخت معاش کارمندان
// =========================================================


// ---------------------------------------------------------
// دریافت پرداخت‌های یک کارمند
// ---------------------------------------------------------

app.get("/api/employees/:employeeId/payments", async (req, res) => {

    try {

        const employeeId = Number(req.params.employeeId);

        if (!employeeId || employeeId <= 0) {

            return res.status(400).json({
                error: "شناسه کارمند نامعتبر است"
            });

        }


        const pool = await sql.connect(dbConfig);


        const result = await pool.request()

            .input(
                "EmployeeId",
                sql.Int,
                employeeId
            )

            .query(`

                SELECT
                    Id,
                    EmployeeId,
                    Amount,
                    PaymentDate,
                    Description,
                    CreatedAt

                FROM EmployeePayments

                WHERE EmployeeId = @EmployeeId

                ORDER BY PaymentDate DESC, Id DESC

            `);


        res.json(result.recordset);


    } catch (err) {

        console.error(
            "❌ Error getting employee payments:",
            err
        );


        res.status(500).json({

            error: "خطا در دریافت پرداخت‌های کارمند",

            details: err.message

        });

    }

});


// ---------------------------------------------------------
// ثبت پرداخت جدید
// ---------------------------------------------------------

app.post("/api/employees/:employeeId/payments", async (req, res) => {

    try {

        const employeeId = Number(req.params.employeeId);


        if (!employeeId || employeeId <= 0) {

            return res.status(400).json({
                error: "شناسه کارمند نامعتبر است"
            });

        }


        const {
            Amount,
            PaymentDate,
            Description
        } = req.body;


        const amount = Number(Amount);


        if (!amount || amount <= 0) {

            return res.status(400).json({
                error: "مبلغ پرداختی باید بیشتر از صفر باشد"
            });

        }


        const pool = await sql.connect(dbConfig);


        // بررسی وجود کارمند

        const employeeCheck = await pool.request()

            .input(
                "EmployeeId",
                sql.Int,
                employeeId
            )

            .query(`

                SELECT Id

                FROM Employees

                WHERE Id = @EmployeeId

            `);


        if (employeeCheck.recordset.length === 0) {

            return res.status(404).json({
                error: "کارمند پیدا نشد"
            });

        }


        const result = await pool.request()

            .input(
                "EmployeeId",
                sql.Int,
                employeeId
            )

            .input(
                "Amount",
                sql.Decimal(18, 2),
                amount
            )

            .input(
                "PaymentDate",
                sql.Date,
                PaymentDate || null
            )

            .input(
                "Description",
                sql.NVarChar(500),
                Description || null
            )

            .query(`

                INSERT INTO EmployeePayments
                (
                    EmployeeId,
                    Amount,
                    PaymentDate,
                    Description,
                    CreatedAt
                )

                OUTPUT
                    INSERTED.Id,
                    INSERTED.EmployeeId,
                    INSERTED.Amount,
                    INSERTED.PaymentDate,
                    INSERTED.Description,
                    INSERTED.CreatedAt

                VALUES
                (
                    @EmployeeId,
                    @Amount,
                    @PaymentDate,
                    @Description,
                    SYSDATETIME()
                )

            `);


        res.status(201).json({

            success: true,

            message: "پرداخت معاش با موفقیت ثبت شد ✅",

            payment: result.recordset[0]

        });


    } catch (err) {

        console.error(
            "❌ Error adding employee payment:",
            err
        );


        res.status(500).json({

            error: "خطا در ثبت پرداخت معاش",

            details: err.message

        });

    }

});


// ---------------------------------------------------------
// ویرایش پرداخت
// ---------------------------------------------------------

app.put("/api/employees/:employeeId/payments/:paymentId", async (req, res) => {

    try {

        const employeeId = Number(req.params.employeeId);

        const paymentId = Number(req.params.paymentId);


        if (!employeeId || employeeId <= 0) {

            return res.status(400).json({
                error: "شناسه کارمند نامعتبر است"
            });

        }


        if (!paymentId || paymentId <= 0) {

            return res.status(400).json({
                error: "شناسه پرداخت نامعتبر است"
            });

        }


        const {
            Amount,
            PaymentDate,
            Description
        } = req.body;


        const amount = Number(Amount);


        if (!amount || amount <= 0) {

            return res.status(400).json({
                error: "مبلغ پرداختی باید بیشتر از صفر باشد"
            });

        }


        const pool = await sql.connect(dbConfig);


        const result = await pool.request()

            .input(
                "Id",
                sql.Int,
                paymentId
            )

            .input(
                "EmployeeId",
                sql.Int,
                employeeId
            )

            .input(
                "Amount",
                sql.Decimal(18, 2),
                amount
            )

            .input(
                "PaymentDate",
                sql.Date,
                PaymentDate || null
            )

            .input(
                "Description",
                sql.NVarChar(500),
                Description || null
            )

            .query(`

                UPDATE EmployeePayments

                SET
                    Amount = @Amount,
                    PaymentDate = @PaymentDate,
                    Description = @Description

                OUTPUT
                    INSERTED.Id,
                    INSERTED.EmployeeId,
                    INSERTED.Amount,
                    INSERTED.PaymentDate,
                    INSERTED.Description,
                    INSERTED.CreatedAt

                WHERE
                    Id = @Id
                    AND EmployeeId = @EmployeeId

            `);


        if (result.recordset.length === 0) {

            return res.status(404).json({
                error: "پرداخت پیدا نشد"
            });

        }


        res.json({

            success: true,

            message: "پرداخت با موفقیت ویرایش شد ✅",

            payment: result.recordset[0]

        });


    } catch (err) {

        console.error(
            "❌ Error editing employee payment:",
            err
        );


        res.status(500).json({

            error: "خطا در ویرایش پرداخت",

            details: err.message

        });

    }

});


// ---------------------------------------------------------
// حذف پرداخت
// ---------------------------------------------------------

app.delete("/api/employees/:employeeId/payments/:paymentId", async (req, res) => {

    try {

        const employeeId = Number(req.params.employeeId);

        const paymentId = Number(req.params.paymentId);


        if (!employeeId || employeeId <= 0) {

            return res.status(400).json({
                error: "شناسه کارمند نامعتبر است"
            });

        }


        if (!paymentId || paymentId <= 0) {

            return res.status(400).json({
                error: "شناسه پرداخت نامعتبر است"
            });

        }


        const pool = await sql.connect(dbConfig);


        const result = await pool.request()

            .input(
                "Id",
                sql.Int,
                paymentId
            )

            .input(
                "EmployeeId",
                sql.Int,
                employeeId
            )

            .query(`

                DELETE FROM EmployeePayments

                WHERE
                    Id = @Id 
                    AND EmployeeId = @EmployeeId

            `);


        if (result.rowsAffected[0] === 0) {

            return res.status(404).json({
                error: "پرداخت پیدا نشد"
            });

        }


        res.json({

            success: true,

            message: "پرداخت با موفقیت حذف شد ✅"

        });


    } catch (err) {

        console.error(
            "❌ Error deleting employee payment:",
            err
        );


        res.status(500).json({

            error: "خطا در حذف پرداخت",

            details: err.message

        });

    }

});


const PORT =
    process.env.PORT || 3000;

    // =========================================================
// PURCHASES API - خریدهای نمایشگاه
// =========================================================

// دریافت خریدها
// مثال:
// /api/purchases
// /api/purchases?month=2026-09

app.get("/api/purchases", async (req, res) => {

    try {

        const month = req.query.month;

        let query = `
            SELECT
                Id,
                ItemName,
                Quantity,
                Unit,
                UnitPrice,
                TotalAmount,
                PurchaseDate,
                Description,
                CreatedAt
            FROM Purchases
        `;

        const request = new sql.Request();

        if (month) {

            query += `
                WHERE CONVERT(char(7), PurchaseDate, 120) = @Month
            `;

            request.input(
                "Month",
                sql.VarChar(7),
                month
            );

        }

        query += `
            ORDER BY PurchaseDate DESC, Id DESC
        `;

        const result =
            await request.query(query);

        res.json(
            result.recordset
        );

    } catch (error) {

        console.error(
            "❌ خطا در دریافت خریدها:",
            error
        );

        res.status(500).json({
            success: false,
            error: "خطا در دریافت خریدها"
        });

    }

});


// =========================================================
// ثبت خرید جدید
// =========================================================
// =========================================================
// ثبت خرید جدید
// =========================================================

app.post("/api/purchases", async (req, res) => {

    try {

        const {
            ItemName,
            Quantity,
            Unit,
            UnitPrice,
            PurchaseDate,
            Description
        } = req.body;


        // بررسی نام کالا
        if (!ItemName || !ItemName.trim()) {

            return res.status(400).json({
                success: false,
                error: "نام کالا را وارد کنید."
            });

        }


        // بررسی تعداد
        if (
            Quantity === undefined ||
            Quantity === null ||
            Number(Quantity) <= 0
        ) {

            return res.status(400).json({
                success: false,
                error: "تعداد خرید نامعتبر است."
            });

        }


        // بررسی قیمت واحد
        if (
            UnitPrice === undefined ||
            UnitPrice === null ||
            Number(UnitPrice) < 0
        ) {

            return res.status(400).json({
                success: false,
                error: "قیمت واحد نامعتبر است."
            });

        }


        // بررسی تاریخ
        if (!PurchaseDate) {

            return res.status(400).json({
                success: false,
                error: "تاریخ خرید را انتخاب کنید."
            });

        }


        const quantity =
            Number(Quantity);

        const unitPrice =
            Number(UnitPrice);


        const request =
            new sql.Request();


        request.input(
            "ItemName",
            sql.NVarChar(200),
            ItemName.trim()
        );


        request.input(
            "Quantity",
            sql.Decimal(18, 2),
            quantity
        );


        request.input(
            "Unit",
            sql.NVarChar(50),
            Unit
                ? Unit.trim()
                : null
        );


        request.input(
            "UnitPrice",
            sql.Decimal(18, 2),
            unitPrice
        );


        request.input(
            "PurchaseDate",
            sql.Date,
            PurchaseDate
        );


        request.input(
            "Description",
            sql.NVarChar(500),
            Description
                ? Description.trim()
                : null
        );


        /*
        نکته مهم:

        TotalAmount در جدول Purchases
        یک Computed Column است.

        بنابراین نباید در INSERT
        مقدار TotalAmount را وارد کنیم.

        SQL Server خودش مقدار زیر را محاسبه می‌کند:

        Quantity × UnitPrice
        */


        const result =
            await request.query(`

                INSERT INTO Purchases
                (
                    ItemName,
                    Quantity,
                    Unit,
                    UnitPrice,
                    PurchaseDate,
                    Description,
                    CreatedAt
                )

                OUTPUT
                    INSERTED.Id,
                    INSERTED.ItemName,
                    INSERTED.Quantity,
                    INSERTED.Unit,
                    INSERTED.UnitPrice,
                    INSERTED.TotalAmount,
                    INSERTED.PurchaseDate,
                    INSERTED.Description,
                    INSERTED.CreatedAt

                VALUES
                (
                    @ItemName,
                    @Quantity,
                    @Unit,
                    @UnitPrice,
                    @PurchaseDate,
                    @Description,
                    SYSDATETIME()
                )

            `);


        res.status(201).json({

            success: true,

            purchase:
                result.recordset[0]

        });


    } catch (error) {

        console.error(
            "❌ خطا در ثبت خرید:",
            error
        );


        res.status(500).json({

            success: false,

            error:
                error.message ||
                "خطا در ثبت خرید"

        });

    }

});

// =========================================================
// ویرایش خرید
// =========================================================

app.put("/api/purchases/:id", async (req, res) => {

    try {

        const id = Number(req.params.id);

        if (!Number.isInteger(id)) {

            return res.status(400).json({
                success: false,
                error: "شناسه خرید نامعتبر است."
            });

        }

        const {
            ItemName,
            Quantity,
            Unit,
            UnitPrice,
            PurchaseDate,
            Description
        } = req.body;


        // بررسی نام کالا
        if (!ItemName || !ItemName.trim()) {

            return res.status(400).json({
                success: false,
                error: "نام کالا را وارد کنید."
            });

        }


        // بررسی تعداد
        if (
            Quantity === undefined ||
            Quantity === null ||
            Number(Quantity) <= 0
        ) {

            return res.status(400).json({
                success: false,
                error: "تعداد خرید نامعتبر است."
            });

        }


        // بررسی قیمت
        if (
            UnitPrice === undefined ||
            UnitPrice === null ||
            Number(UnitPrice) < 0
        ) {

            return res.status(400).json({
                success: false,
                error: "قیمت واحد نامعتبر است."
            });

        }


        // بررسی تاریخ
        if (!PurchaseDate) {

            return res.status(400).json({
                success: false,
                error: "تاریخ خرید را انتخاب کنید."
            });

        }


        const quantity = Number(Quantity);
        const unitPrice = Number(UnitPrice);


        const request = new sql.Request();


        request.input(
            "Id",
            sql.Int,
            id
        );

        request.input(
            "ItemName",
            sql.NVarChar(200),
            ItemName.trim()
        );

        request.input(
            "Quantity",
            sql.Decimal(18, 2),
            quantity
        );

        request.input(
            "Unit",
            sql.NVarChar(50),
            Unit
                ? Unit.trim()
                : null
        );

        request.input(
            "UnitPrice",
            sql.Decimal(18, 2),
            unitPrice
        );

        request.input(
            "PurchaseDate",
            sql.Date,
            PurchaseDate
        );

        request.input(
            "Description",
            sql.NVarChar(500),
            Description
                ? Description.trim()
                : null
        );


        const result = await request.query(`

            UPDATE Purchases

            SET
                ItemName = @ItemName,
                Quantity = @Quantity,
                Unit = @Unit,
                UnitPrice = @UnitPrice,
                PurchaseDate = @PurchaseDate,
                Description = @Description

            OUTPUT
                INSERTED.Id,
                INSERTED.ItemName,
                INSERTED.Quantity,
                INSERTED.Unit,
                INSERTED.UnitPrice,
                INSERTED.TotalAmount,
                INSERTED.PurchaseDate,
                INSERTED.Description,
                INSERTED.CreatedAt

            WHERE Id = @Id

        `);


        if (result.recordset.length === 0) {

            return res.status(404).json({
                success: false,
                error: "خرید پیدا نشد."
            });

        }


        res.json({
            success: true,
            purchase: result.recordset[0]
        });


    } catch (error) {

        console.error(
            "❌ خطا در ویرایش خرید:",
            error
        );

        res.status(500).json({
            success: false,
            error: error.message || "خطا در ویرایش خرید"
        });

    }

});

// =========================================================
// حذف خرید
// =========================================================

app.delete("/api/purchases/:id", async (req, res) => {

    try {

        const id =
            Number(req.params.id);


        if (!Number.isInteger(id)) {

            return res.status(400).json({
                success: false,
                error: "شناسه خرید نامعتبر است."
            });

        }


        const request =
            new sql.Request();


        request.input(
            "Id",
            sql.Int,
            id
        );


        const result =
            await request.query(`

                DELETE FROM Purchases

                OUTPUT
                    DELETED.Id

                WHERE Id = @Id

            `);


        if (
            result.recordset.length === 0
        ) {

            return res.status(404).json({
                success: false,
                error: "خرید پیدا نشد."
            });

        }


        res.json({
            success: true,
            message: "خرید با موفقیت حذف شد."
        });


    } catch (error) {

        console.error(
            "❌ خطا در حذف خرید:",
            error
        );

        res.status(500).json({
            success: false,
            error: "خطا در حذف خرید"
        });

    }

});

app.listen(PORT, () => {

    console.log(
        `🚀 Server running on port ${PORT}`
    );

});