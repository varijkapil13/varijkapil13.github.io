---
title: "What are Resizable Arrays and ArrayList?"
description: "Understanding dynamic arrays in Java and how ArrayList provides automatic resizing capabilities."
date: 2020-05-14
tags: ["java", "basics", "beginner"]
---

In programming languages like Java, arrays have fixed size. This means you cannot change the size of an array after its creation.

This is how you would initialize an array in Java:

```java
int[] integerArray = new int[10];
```

This will initiate an `integer` array of size 10, and since we provided the size of the array, it cannot hold more than 10 values.

For situations where we need to dynamically add new values to an array, this is a problem. That's where resizable arrays come in.

## What is an ArrayList?

Resizable arrays, or `ArrayList` as they are called in Java, is an array-like data structure that offers dynamic resizing. We do not have to specify the size of this array, as it will automatically resize itself when new elements are added to it. How and when the resizing happens is dependent on the implementation in specific libraries/languages.

## Example Usage

Here's an example of how to use ArrayList:

```java
public ArrayList<Integer> createResizableArrayList(int[] evenNumbers, int[] oddNumbers){
    // Type definition can be skipped in the constructor because it is inferred from the declaration part
    ArrayList<Integer> allNumbers = new ArrayList<>();

    for(int even: evenNumbers){
        allNumbers.add(even);
    }

    for(int odd: oddNumbers){
       allNumbers.add(odd);
    }

    return allNumbers;
}
```

In the above example, `allNumbers` array will automatically resize itself to accommodate the values from both `evenNumbers` array and `oddNumbers` array.

## Key Benefits

- **Dynamic sizing**: No need to specify the size upfront
- **Easy to use**: Simple API for adding, removing, and accessing elements
- **Flexible**: Can grow and shrink as needed

## When to Use ArrayList vs Arrays

Use **ArrayList** when:
- You don't know the exact number of elements in advance
- You need to frequently add or remove elements
- You need the flexibility of a dynamic collection

Use **regular arrays** when:
- You know the exact size of the collection
- Performance is critical (arrays have slightly less overhead)
- You're working with primitive types and want to avoid boxing
