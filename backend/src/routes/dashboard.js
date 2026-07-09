const express = require("express");

const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");
const Resume = require("../models/Resume");
const ResumeVersion = require("../models/ResumeVersion");
const Analysis = require("../models/Analysis");

const router = express.Router();

router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = req.user._id;

    const resumes = await Resume.find({ userId })
      .sort({ updatedAt: -1 })
      .lean();

    const resumeIds = resumes.map((resume) => resume._id);
    const resumeMap = new Map(
      resumes.map((resume) => [resume._id.toString(), resume])
    );

    const [allAnalyses, rewriteCount, latestResumeVersions, recentVersions, recentAnalyses] =
      await Promise.all([
        Analysis.find({ userId })
          .select(
            "_id resumeId versionId atsScore keywordsPresent keywordsMissing issues createdAt"
          )
          .sort({ createdAt: 1 })
          .lean(),
        ResumeVersion.countDocuments({
          resumeId: { $in: resumeIds },
          sourceType: "rewrite",
        }),
        resumes[0]
          ? ResumeVersion.find({
              resumeId: resumes[0]._id,
            })
              .sort({ versionNumber: 1 })
              .lean()
          : Promise.resolve([]),
        ResumeVersion.find({
          resumeId: { $in: resumeIds },
        })
          .sort({ createdAt: -1 })
          .limit(10)
          .select("resumeId label versionNumber sourceType createdAt")
          .lean(),
        Analysis.find({ userId })
          .sort({ createdAt: -1 })
          .limit(10)
          .select("resumeId versionId atsScore createdAt")
          .lean(),
      ]);

    const latestResumeMeta = resumes[0] || null;
    const latestAnalysis = allAnalyses[allAnalyses.length - 1] || null;
    const prevAnalysis = allAnalyses[allAnalyses.length - 2] || null;

    let latestResume = null;
    let scoreSeries = [];
    let versionStack = [];

    if (latestResumeMeta) {
      const analysisIds = latestResumeVersions
        .map((version) => version.latestAnalysisId)
        .filter(Boolean);

      const versionAnalyses = analysisIds.length
        ? await Analysis.find({
            _id: { $in: analysisIds },
          })
            .select("_id atsScore versionId createdAt")
            .lean()
        : [];

      const scoreByVersion = new Map(
        versionAnalyses.map((analysis) => [
          analysis.versionId.toString(),
          analysis.atsScore,
        ])
      );

      const versionsWithScores = latestResumeVersions.map((version) => ({
        id: version._id.toString(),
        label: version.label,
        versionNumber: version.versionNumber,
        sourceType: version.sourceType,
        createdAt: version.createdAt,
        score: scoreByVersion.get(version._id.toString()) ?? null,
      }));

      latestResume = {
        _id: latestResumeMeta._id.toString(),
        id: latestResumeMeta._id.toString(),
        title: latestResumeMeta.title,
        latestVersionNumber: latestResumeMeta.latestVersionNumber,
        updatedAt: latestResumeMeta.updatedAt,
        currentVersionId: latestResumeMeta.currentVersionId?.toString() || null,
      };

      scoreSeries = versionsWithScores
        .filter((version) => version.score != null)
        .map((version) => ({
          label: version.label,
          score: version.score,
          versionId: version.id,
          at: version.createdAt,
        }));

      versionStack = versionsWithScores.slice(-3).map((version, index, stack) => {
        const prevVersion = stack[index - 1];
        const delta =
          version.score != null && prevVersion?.score != null
            ? version.score - prevVersion.score
            : 0;

        return {
          id: version.id,
          label: version.label,
          title:
            version.sourceType === "upload"
              ? "Upload"
              : version.sourceType === "rewrite"
              ? "Rewrite pass"
              : version.label,
          score: version.score ?? 0,
          delta,
        };
      });
    }

    const scoreSpark = allAnalyses
      .slice(-10)
      .map((analysis) => analysis.atsScore);

    const versionsSpark = resumes
      .slice(0, 10)
      .reverse()
      .map((resume) => resume.latestVersionNumber || 1);

    const keywordsSpark = allAnalyses
      .slice(-10)
      .map((analysis) => (analysis.keywordsPresent || []).length);

    const issuesSpark = allAnalyses
      .slice(-10)
      .map((analysis) => (analysis.issues || []).length);

    const latestKeywordTotal = latestAnalysis
      ? (latestAnalysis.keywordsPresent?.length || 0) +
        (latestAnalysis.keywordsMissing?.length || 0)
      : null;

    const kpi = {
      atsScore: {
        value: latestAnalysis?.atsScore ?? null,
        delta:
          latestAnalysis && prevAnalysis
            ? latestAnalysis.atsScore - prevAnalysis.atsScore
            : null,
        spark: scoreSpark,
      },
      versions: {
        value: resumes.reduce(
          (sum, resume) => sum + (resume.latestVersionNumber || 1),
          0
        ),
        delta: null,
        spark: versionsSpark,
      },
      issuesIdentified: {
        value: latestAnalysis ? latestAnalysis.issues?.length || 0 : null,
        delta:
          latestAnalysis && prevAnalysis
            ? (latestAnalysis.issues?.length || 0) -
              (prevAnalysis.issues?.length || 0)
            : null,
        spark: issuesSpark,
      },
      keywordsMatched: {
        value: latestAnalysis ? latestAnalysis.keywordsPresent?.length || 0 : null,
        total: latestKeywordTotal,
        delta:
          latestAnalysis && prevAnalysis
            ? (latestAnalysis.keywordsPresent?.length || 0) -
              (prevAnalysis.keywordsPresent?.length || 0)
            : null,
        spark: keywordsSpark,
      },
    };

    const events = [];

    for (const resume of resumes.slice(0, 10)) {
      events.push({
        id: `R-${resume._id}`,
        type: "upload",
        title: `${resume.title} uploaded`,
        subtitle: "Parsed and version V1 created",
        label: "V1",
        at: resume.createdAt,
        resumeId: resume._id.toString(),
      });
    }

    for (const version of recentVersions) {
      if (version.sourceType !== "rewrite") continue;

      const resume = resumeMap.get(version.resumeId.toString());

      events.push({
        id: `V-${version._id}`,
        type: "rewrite",
        title: `${version.label} created for ${resume?.title || "resume"}`,
        subtitle: "Rewrites applied",
        label: `${version.label} created`,
        at: version.createdAt,
        resumeId: version.resumeId.toString(),
      });
    }

    for (const analysis of recentAnalyses) {
      const resume = resumeMap.get(analysis.resumeId.toString());

      events.push({
        id: `A-${analysis._id}`,
        type: "analyze",
        title: `Analysis complete on ${resume?.title || "resume"}`,
        subtitle: `ATS score ${analysis.atsScore} / 100`,
        label: `${analysis.atsScore}`,
        at: analysis.createdAt,
        resumeId: analysis.resumeId.toString(),
      });
    }

    const activity = events
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, 8);

    res.json({
      totals: {
        resumes: resumes.length,
        rewrites: rewriteCount,
        analyses: allAnalyses.length,
        exports: 0,
      },
      latestResume,
      scoreSeries,
      versionStack,
      kpi,
      activity,
    });
  })
);

module.exports = router;
