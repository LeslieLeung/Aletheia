#!/usr/bin/env python3
"""Train XGBoost classifier for DivEye using surprisal features.

Usage:
    python scripts/train_diveye.py \
        --train_dataset data.csv \
        --model_dir /app/models/openai-community/gpt2 \
        --output models/diveye/xgb_classifier.json

The CSV must have columns: "text" and "label" (0=human, 1=ai).
"""

import argparse
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, classification_report, roc_auc_score
from xgboost import XGBClassifier

from app.detectors.features import SurprisalExtractor


def main() -> None:
    parser = argparse.ArgumentParser(description="Train DivEye XGBoost classifier")
    parser.add_argument(
        "--train_dataset", type=str, required=True, help="Path to CSV (text, label)"
    )
    parser.add_argument(
        "--test_dataset", type=str, default=None, help="Path to test CSV (text, label)"
    )
    parser.add_argument(
        "--model_dir",
        type=str,
        default="/app/models/openai-community/gpt2",
        help="Path to ONNX GPT-2 model directory",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="models/diveye/xgb_classifier.json",
        help="Output path for XGBoost model (JSON)",
    )
    args = parser.parse_args()

    print(f"[train] Loading GPT-2 from {args.model_dir} …")
    extractor = SurprisalExtractor(Path(args.model_dir))

    print(f"[train] Reading dataset from {args.train_dataset} …")
    df = pd.read_csv(args.train_dataset)
    assert "text" in df.columns and "label" in df.columns, (
        "CSV must have 'text' and 'label' columns"
    )

    print(f"[train] Extracting features for {len(df)} samples …")
    features_list: list[np.ndarray] = []
    labels: list[int] = []
    for i, row in df.iterrows():
        feat = extractor.extract_features(row["text"])
        features_list.append(feat)
        labels.append(int(row["label"]))
        if (i + 1) % 100 == 0:
            print(f"  processed {i + 1}/{len(df)}")

    X = np.stack(features_list)
    y = np.array(labels)

    print(f"[train] Training XGBClassifier on {X.shape} features …")
    clf = XGBClassifier(
        max_depth=12,
        n_estimators=200,
        colsample_bytree=0.8,
        subsample=0.7,
        min_child_weight=5,
        gamma=1.0,
        eval_metric="logloss",
        use_label_encoder=False,
    )
    clf.fit(X, y)

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    clf.save_model(str(out_path))
    print(f"[train] Model saved to {out_path}")

    if args.test_dataset:
        print(f"[eval] Reading test dataset from {args.test_dataset} …")
        df_test = pd.read_csv(args.test_dataset)
        assert "text" in df_test.columns and "label" in df_test.columns, (
            "Test CSV must have 'text' and 'label' columns"
        )

        print(f"[eval] Extracting features for {len(df_test)} test samples …")
        test_features: list[np.ndarray] = []
        test_labels: list[int] = []
        for i, row in df_test.iterrows():
            feat = extractor.extract_features(row["text"])
            test_features.append(feat)
            test_labels.append(int(row["label"]))
            if (i + 1) % 100 == 0:
                print(f"  processed {i + 1}/{len(df_test)}")

        X_test = np.stack(test_features)
        y_test = np.array(test_labels)

        y_pred = clf.predict(X_test)
        y_prob = clf.predict_proba(X_test)[:, 1]

        print("\n[eval] Test set results:")
        print(f"  Accuracy : {accuracy_score(y_test, y_pred):.4f}")
        print(f"  ROC-AUC  : {roc_auc_score(y_test, y_prob):.4f}")
        print("\n" + classification_report(y_test, y_pred, target_names=["human", "ai"]))


if __name__ == "__main__":
    main()
