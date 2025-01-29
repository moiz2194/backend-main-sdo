const express = require('express');
const router = express.Router();
const asyncerror = require('../middlewares/catchasyncerror');
const { verifyToken, isadmin } = require('../middlewares/verifyauth');
const User = require('../model/user');
const ErrorHandler = require('../middlewares/errorhandler');
const Plan = require('../model/Plans');
const cron = require('node-cron');
const Reward = require('../model/Reward');
const { v4: uuidv4 } = require('uuid');

function getDateAfterXDays(x) {
    if (typeof x !== 'number' || x <= 0) {
        throw new Error('Invalid number of days');
    }

    const currentDate = new Date();
    const futureDate = new Date(currentDate.getTime() + x * 24 * 60 * 60 * 1000);
    return futureDate;
}

// Get Plan
router.get('/', verifyToken, asyncerror(async (req, res, next) => {
    const data = await Plan.find();
    res.status(200).send({ success: true, data })
}));
router.post('/', verifyToken, asyncerror(async (req, res, next) => {
    const user = await User.findById(req._id);
    const plan = await Plan.findById(req.body.id);
    if (!plan) {
        return next(new ErrorHandler('Plan not Found', 404))
    }
    const totalbalance = user.balance + user.locked_amount;
    if (totalbalance < req.body.amount) {
        return next(new ErrorHandler('Not enough balance', 404))
    }
    const id = uuidv4();
    if (user.locked_amount >= req.body.amount) {
        user.locked_amount -= req.body.amount;
    } else {
        const remainingAmount = req.body.amount - user.locked_amount;
        user.locked_amount = 0;
        user.balance -= remainingAmount;
    }
    user.membership.plan = plan._id;
    user.membership.locked_amount = req.body.amount;
    user.membership.id = id;
    user.membership.end_date = getDateAfterXDays(plan.duration);
    user.save()
    res.status(200).send({ success: true })
}));
router.put('/', verifyToken, asyncerror(async (req, res, next) => {
    const user = await User.findById(req._id);
    const plan = await Plan.findById(req.body.id);
    if (!plan) {
        return next(new ErrorHandler('Plan not Found', 404))
    }
    user.balance += user.membership.balance;
    const totalbalance = user.balance + user.locked_amount;
    if (totalbalance < req.body.amount) {
        return next(new ErrorHandler('Not enough balance', 404))
    }
    const id = uuidv4();
    if (user.locked_amount >= req.body.amount) {
        user.locked_amount -= req.body.amount;
    } else {
        const remainingAmount = req.body.amount - user.locked_amount;
        user.locked_amount = 0;
        user.balance -= remainingAmount;
    }
    user.membership.plan = plan._id;
    user.membership.locked_amount = req.body.amount;
    user.membership.id = id;
    user.membership.end_date = getDateAfterXDays(plan.duration);
    user.save()
    res.status(200).send({ success: true })
}));


router.post('/startmining', verifyToken, asyncerror(async (req, res, next) => {
    const user = await User.findById(req._id).populate('membership.plan');
    const today = new Date();
    user.miningstartdata = today;
    await user.save();

    // Schedule mining profit distribution after 4 hours
    setTimeout(async () => {
        try {
            const updatedUser = await User.findById(req._id).populate('membership.plan');
            if (!updatedUser) return;

            if (updatedUser.membership?.plan) {
                let totalbalance = updatedUser.membership.locked_amount + updatedUser.membership.balance;
                const profit = (totalbalance * updatedUser.membership.plan.profit) / 100;
                
                if (updatedUser.membership.end_date < today) {
                    updatedUser.balance += updatedUser.membership.balance;
                    updatedUser.membership = null;
                } else {
                    updatedUser.membership.balance += profit;
                    await Reward.create({ amount: profit, user: updatedUser._id, id: updatedUser.membership._id, type: "Investment Plan" });
                }
            } else {
                let totalbalance = updatedUser.locked_amount + updatedUser.balance;
                const profit = (totalbalance * 3) / 100;
                await Reward.create({ amount: profit, user: updatedUser._id, type: "Normal Plan" });
                updatedUser.balance += profit;
            }

            await updatedUser.save();
            console.log(`Mining profit distributed for user ${updatedUser._id}`);
        } catch (error) {
            console.error(`Error processing mining rewards for user ${req._id}:`, error);
        }
    }, 4 * 60 * 60 * 1000); // 4 hours in milliseconds

    res.status(200).send({ success: true, message: "Mining started. Profit will be credited after 4 hours." });
}));

// cron.schedule('0 0 * * *', asyncerror(async () => {
//     const allusers = await User.find().populate('membership.plan');
//     const today = new Date();
//     for (const elem of allusers) {
//         if (elem.membership?.plan) {
//             let totalbalance = elem.membership.locked_amount + elem.membership.balance
//             const profit = (totalbalance * elem.membership.plan.profit) / 100;
//             let newtotalbalance = elem.membership.balance + profit;
//             elem.membership.balance = newtotalbalance;
//             if (elem.membership.end_date < today) {
//                 elem.balance += elem.membership.balance;
//                 elem.membership = null;
//             }
//             await Reward.create({ amount: profit, user: elem._id, id: elem.membership.id,type:"Investment Plan" });
//         } else {
//             let totalbalance = elem.locked_amount + elem.balance
//             const profit = (totalbalance * 3) / 100;
//             let newtotalbalance = elem.balance + profit;
//             await Reward.create({ amount: profit, user: elem._id,type:"Normal Plan" });
//             elem.balance = newtotalbalance;
//         }
//         elem.save();
//     };
// }));


module.exports = router;